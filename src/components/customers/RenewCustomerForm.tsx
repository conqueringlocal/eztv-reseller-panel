
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
  const { user } = useAuth();
  const { resellers, refreshData } = useApp();
  const [renewalCostInfo, setRenewalCostInfo] = useState<RenewalCostInfo | null>(null);
  const [isLoadingCost, setIsLoadingCost] = useState(false);
  
  // Get current reseller to show available credits
  const currentReseller = resellers.find(r => r.id === user?.id);
  
  // Initialize form with default values - using number directly
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      planDuration: 1,
    },
  });

  // Watch plan duration to show real-time credit calculation
  const planDuration = form.watch('planDuration');

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

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You need to be logged in to renew a subscription.');
      return;
    }

    if (!renewalCostInfo) {
      toast.error('Please wait for cost calculation to complete.');
      return;
    }

    // Check credits before attempting renewal
    if (currentReseller && currentReseller.credits < renewalCostInfo.creditsRequired) {
      toast.error(`Insufficient credits. You need ${renewalCostInfo.creditsRequired} credits but only have ${currentReseller.credits}.`);
      return;
    }
    
    try {
      console.log(`🔄 RenewCustomerForm: Starting group renewal for ${customer.name}`);
      console.log(`📋 Renewal details:`, {
        customerId: customer.id,
        planDuration: data.planDuration,
        accountsCount: renewalCostInfo.accountsCount,
        creditsRequired: renewalCostInfo.creditsRequired
      });
      
      const { data: renewalResult, error } = await supabase.rpc('renew_customer_group', {
        customer_id_param: customer.id,
        duration_months: data.planDuration,
        reseller_id_param: user.id
      });

      if (error) {
        console.error('❌ Database error during renewal:', error);
        toast.error('Failed to renew subscription - database error');
        return;
      }

      if (renewalResult && renewalResult.length > 0) {
        const result = renewalResult[0];
        console.log('📊 Renewal result:', result);
        
        if (result.success) {
          console.log(`✅ RenewCustomerForm: Group renewal successful for ${customer.name}`);
          console.log(`📈 Renewed ${result.accounts_renewed} accounts using ${result.credits_used} credits`);
          
          toast.success(
            `Successfully renewed ${result.accounts_renewed} account${result.accounts_renewed !== 1 ? 's' : ''} for ${data.planDuration} month${data.planDuration !== 1 ? 's' : ''}. Used ${result.credits_used} credits.`
          );
          
          form.reset();
          await refreshData(); // Refresh data to show updated customer info
          if (onSuccess) onSuccess();
        } else {
          console.error(`❌ RenewCustomerForm: Renewal failed - ${result.error_message}`);
          toast.error(result.error_message || 'Failed to renew subscription');
        }
      } else {
        console.error('❌ RenewCustomerForm: No renewal result returned');
        toast.error('Failed to renew subscription - no result');
      }
    } catch (error) {
      console.error('💥 RenewCustomerForm: Unexpected error during renewal:', error);
      toast.error('An unexpected error occurred while renewing the subscription.');
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
              This ensures all their connections remain active and synchronized.
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
          <Button type="button" variant="outline" onClick={onSuccess}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={
              isLoadingCost || 
              !renewalCostInfo ||
              (currentReseller && currentReseller.credits < (renewalCostInfo?.creditsRequired || 0))
            }
          >
            {isLoadingCost ? 'Calculating...' : 
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
