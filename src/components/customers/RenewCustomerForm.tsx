
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Customer } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { findPotentialDuplicates } from '@/utils/customerConsolidation/duplicateDetection';
import { DuplicateRenewalWarning } from './DuplicateRenewalWarning';

// Form schema with validation - using numbers directly instead of enum transformation
const formSchema = z.object({
  planDuration: z.number().refine((val) => [1, 3, 6, 12].includes(val), {
    message: 'Please select a valid plan duration (1, 3, 6, or 12 months).',
  }),
});

type FormData = z.infer<typeof formSchema>;

interface RenewCustomerFormProps {
  customer: Customer;
  onSuccess?: () => void;
}

interface RenewalCostInfo {
  creditsRequired: number;
  accountsCount: number;
  customerGroupName: string;
}

export function RenewCustomerForm({ customer, onSuccess }: RenewCustomerFormProps) {
  const { user, isAuthenticated } = useAuth();
  const { resellers, refreshData, customers } = useApp();
  const [renewalCostInfo, setRenewalCostInfo] = useState<RenewalCostInfo | null>(null);
  const [isLoadingCost, setIsLoadingCost] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [authCheckPassed, setAuthCheckPassed] = useState(false);
  
  // Get current reseller to show available credits
  const currentReseller = resellers.find(r => r.id === user?.id);
  
  // Check for duplicate customers
  const duplicateCheck = findPotentialDuplicates(customer, customers.filter(c => c.resellerId === user?.id));
  const hasDuplicates = duplicateCheck && duplicateCheck.matchingCustomers.length > 0;
  
  // Initialize form with default values - using number directly
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      planDuration: 1,
    },
  });

  // Watch plan duration to show real-time credit calculation
  const planDuration = form.watch('planDuration');

  // Authentication validation effect
  useEffect(() => {
    const validateAuth = async () => {
      if (!isAuthenticated || !user) {
        setAuthCheckPassed(false);
        return;
      }

      try {
        // Verify user session is valid by making a test query
        const { error } = await supabase.from('profiles').select('id').eq('id', user.id).single();
        
        if (error) {
          console.error('❌ Auth validation failed:', error);
          setAuthCheckPassed(false);
          toast.error('Authentication expired. Please log in again.');
        } else {
          setAuthCheckPassed(true);
        }
      } catch (error) {
        console.error('❌ Auth check error:', error);
        setAuthCheckPassed(false);
      }
    };

    validateAuth();
  }, [isAuthenticated, user]);

  // Calculate renewal cost when plan duration changes
  useEffect(() => {
    const calculateRenewalCost = async () => {
      if (!planDuration || !customer.id) return;
      
      setIsLoadingCost(true);
      try {
        console.log(`💰 Calculating renewal cost for customer ${customer.id} with ${planDuration} months`);
        
        const { data, error } = await supabase.rpc('calculate_renewal_credits_required', {
          customer_id_param: customer.id,
          duration_months: planDuration
        });

        if (error) {
          console.error('Error calculating renewal cost:', error);
          toast.error('Failed to calculate renewal cost');
          return;
        }

        if (data && data.length > 0) {
          const costInfo = data[0];
          console.log('📊 Renewal cost calculation result:', costInfo);
          
          setRenewalCostInfo({
            creditsRequired: costInfo.credits_required,
            accountsCount: costInfo.accounts_count,
            customerGroupName: costInfo.customer_group_name
          });
        }
      } catch (error) {
        console.error('Unexpected error calculating renewal cost:', error);
        toast.error('Failed to calculate renewal cost');
      } finally {
        setIsLoadingCost(false);
      }
    };

    calculateRenewalCost();
  }, [planDuration, customer.id]);

  // Handle form submission with enhanced error handling
  const onSubmit = async (data: FormData) => {
    if (!isAuthenticated) {
      toast.error("Authentication required. Please log in again.");
      return;
    }

    if (!renewalCostInfo) {
      toast.error("Still calculating renewal cost. Please wait.");
      return;
    }

    if (currentReseller && currentReseller.credits < renewalCostInfo.creditsRequired) {
      toast.error(
        `Insufficient credits. You need ${renewalCostInfo.creditsRequired} credits but only have ${currentReseller.credits}.`
      );
      return;
    }

    setIsRenewing(true);

    try {
      const accountsInGroup = renewalCostInfo.accountsCount;
      
      console.log('🔄 Starting renewal process for customer:', customer.id);
      console.log('   - Customer group:', customer.customer_group);
      console.log('   - Accounts in group:', accountsInGroup);
      console.log('   - Plan duration:', data.planDuration, 'months');
      console.log('   - Credits required:', renewalCostInfo.creditsRequired);
      console.log('   - Current credits:', currentReseller?.credits || 0);

      // Show progress toast for multi-account renewals
      if (accountsInGroup > 1) {
        toast.loading(`Renewing ${accountsInGroup} accounts...`, { id: 'renewal-progress' });
      }

      const { data: responseData, error } = await supabase.functions.invoke(
        'renew-customer-group',
        {
          body: {
            customerId: customer.id,
            planDuration: data.planDuration,
          }
        }
      );

      // Dismiss progress toast
      if (accountsInGroup > 1) {
        toast.dismiss('renewal-progress');
      }

      // Enhanced error handling with retry logic for network/auth issues
      if (error) {
        console.error('❌ Edge function error:', error);
        
        // Check if it's a network or auth error that might be temporary
        if (error.message?.includes('Failed to fetch') || 
            error.message?.includes('network') ||
            error.message?.includes('JWT')) {
          toast.error("Connection issue. Please try again.");
        } else {
          toast.error(`Renewal failed: ${error.message}`);
        }
        setIsRenewing(false);
        return;
      }

      if (!responseData?.success) {
        const errorMessage = responseData?.error || 'Unknown error occurred';
        console.error('❌ Renewal failed:', responseData);
        
        // Show detailed error information for partial failures
        if (responseData?.failedRenewals?.length > 0) {
          const totalAccounts = responseData.summary?.total || accountsInGroup;
          const successCount = responseData.summary?.successful || 0;
          const failedCount = responseData.summary?.failed || responseData.failedRenewals.length;
          
          console.error(`   Failed accounts (${failedCount}/${totalAccounts}):`, responseData.failedRenewals);
          
          // Show summary first
          toast.error(
            `Partial renewal: ${successCount} succeeded, ${failedCount} failed. Check console for details.`,
            { duration: 8000 }
          );
          
          // Show individual failures
          responseData.failedRenewals.forEach((failure: any, index: number) => {
            if (index < 3) { // Limit to first 3 to avoid spam
              setTimeout(() => {
                toast.error(
                  `${failure.name}: ${failure.error}`,
                  { duration: 5000 }
                );
              }, index * 500);
            }
          });
        } else {
          toast.error(errorMessage);
        }
        
        setIsRenewing(false);
        return;
      }

      // Success case
      const accountsRenewed = responseData.accountsRenewed || 1;
      const creditsUsed = responseData.creditsUsed || renewalCostInfo.creditsRequired;
      
      console.log('✅ Renewal successful!');
      console.log('   - Accounts renewed:', accountsRenewed);
      console.log('   - Credits used:', creditsUsed);
      console.log('   - Plan duration:', data.planDuration, 'months');
      
      // Enhanced success message for multi-account renewals
      if (accountsRenewed > 1) {
        toast.success(
          `🎉 Successfully renewed all ${accountsRenewed} accounts for ${data.planDuration} ${data.planDuration === 1 ? 'month' : 'months'}!`,
          { duration: 5000 }
        );
        toast.success(`${creditsUsed} credits used`, { duration: 3000 });
      } else {
        toast.success(
          `Successfully renewed for ${data.planDuration} ${data.planDuration === 1 ? 'month' : 'months'}. ${creditsUsed} credits used.`
        );
      }

      form.reset();
      await refreshData();
      onSuccess?.();
    } catch (error) {
      console.error('❌ Unexpected error during renewal:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsRenewing(false);
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Show duplicate warning if detected */}
        {hasDuplicates && duplicateCheck && (
          <DuplicateRenewalWarning
            customer={customer}
            duplicates={duplicateCheck.matchingCustomers}
          />
        )}
        <div className="rounded-md bg-gray-50 p-4 mb-2">
          <h3 className="text-sm font-medium">Customer Information</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-gray-500">Name</p>
              <p className="text-sm">{customer.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm">{customer.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Device</p>
              <p className="text-sm">{customer.deviceType}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Current Expiration</p>
              <p className="text-sm">{new Date(customer.expirationDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className="text-sm capitalize">{customer.status}</p>
            </div>
            {customer.macAddress && (
              <div>
                <p className="text-xs text-gray-500">MAC Address</p>
                <p className="text-sm font-mono">{customer.macAddress}</p>
              </div>
            )}
          </div>
        </div>

        {/* Authentication Status */}
        <div className={`rounded-md p-4 mb-4 ${
          isAuthenticated && authCheckPassed 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <h3 className={`text-sm font-medium ${
            isAuthenticated && authCheckPassed ? 'text-green-900' : 'text-red-900'
          }`}>
            Authentication Status
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isAuthenticated && authCheckPassed ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`text-sm ${
              isAuthenticated && authCheckPassed ? 'text-green-700' : 'text-red-700'
            }`}>
              {isAuthenticated && authCheckPassed 
                ? `Authenticated as ${user?.name || user?.email}` 
                : 'Authentication required'
              }
            </span>
          </div>
        </div>

        {/* Credits information */}
        {currentReseller && (
          <div className="rounded-md bg-blue-50 p-4 mb-4">
            <h3 className="text-sm font-medium text-blue-900">Credit Information</h3>
            <div className="mt-2 flex justify-between items-center">
              <span className="text-sm text-blue-700">Available Credits:</span>
              <span className="text-sm font-semibold text-blue-900">{currentReseller.credits}</span>
            </div>
            <div className="mt-1 flex justify-between items-center">
              <span className="text-sm text-blue-700">Required Credits:</span>
              <span className="text-sm font-semibold text-blue-900">
                {isLoadingCost ? '...' : (renewalCostInfo?.creditsRequired || 0)}
              </span>
            </div>
            {renewalCostInfo && (
              <div className="mt-1 flex justify-between items-center">
                <span className="text-sm text-blue-700">Accounts to Renew:</span>
                <span className="text-sm font-semibold text-blue-900">{renewalCostInfo.accountsCount}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between items-center border-t border-blue-200 pt-2">
              <span className="text-sm text-blue-700">Remaining After Renewal:</span>
              <span className={`text-sm font-semibold ${
                (currentReseller.credits - (renewalCostInfo?.creditsRequired || 0)) >= 0 ? 'text-green-700' : 'text-red-700'
              }`}>
                {currentReseller.credits - (renewalCostInfo?.creditsRequired || 0)}
              </span>
            </div>
          </div>
        )}

        {/* Group information */}
        {renewalCostInfo && renewalCostInfo.accountsCount > 1 && (
          <div className="rounded-md bg-amber-50 p-4 mb-4 border border-amber-200">
            <h3 className="text-sm font-medium text-amber-900">⚠️ Group Renewal Notice</h3>
            <p className="mt-1 text-sm text-amber-700">
              This customer has <strong>{renewalCostInfo.accountsCount} linked accounts</strong> that will all be renewed together. 
              Each account will be renewed separately via API calls to ensure proper activation.
            </p>
          </div>
        )}
        
        <FormField
          control={form.control}
          name="planDuration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plan Duration</FormLabel>
              <Select 
                onValueChange={(value) => field.onChange(parseInt(value))} 
                value={field.value?.toString()}
                disabled={isRenewing}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan duration" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="1">1 Month</SelectItem>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {renewalCostInfo ? (
                  <>
                    This will renew <strong>{renewalCostInfo.accountsCount} account{renewalCostInfo.accountsCount !== 1 ? 's' : ''}</strong> and 
                    consume <strong>{renewalCostInfo.creditsRequired} credit{renewalCostInfo.creditsRequired !== 1 ? 's' : ''}</strong>.
                    Each account will be renewed separately via API.
                  </>
                ) : (
                  `Calculating renewal cost...`
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onSuccess} disabled={isRenewing}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={
              isRenewing ||
              isLoadingCost || 
              !renewalCostInfo ||
              !isAuthenticated ||
              !authCheckPassed ||
              (currentReseller && currentReseller.credits < (renewalCostInfo?.creditsRequired || 0))
            }
            onClick={() => {
              console.log('🔄 Renew button clicked with state:', {
                isRenewing,
                isLoadingCost,
                renewalCostInfo,
                isAuthenticated,
                authCheckPassed,
                currentResellerCredits: currentReseller?.credits,
                creditsRequired: renewalCostInfo?.creditsRequired,
                isDisabled: isRenewing ||
                  isLoadingCost || 
                  !renewalCostInfo ||
                  !isAuthenticated ||
                  !authCheckPassed ||
                  (currentReseller && currentReseller.credits < (renewalCostInfo?.creditsRequired || 0))
              });
            }}
          >
            {isRenewing ? 'Renewing...' :
             isLoadingCost ? 'Calculating...' : 
             !isAuthenticated || !authCheckPassed ? 'Authentication Required' :
             (currentReseller && renewalCostInfo && currentReseller.credits < renewalCostInfo.creditsRequired) 
              ? 'Insufficient Credits' 
              : 'Renew Subscription'
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}
