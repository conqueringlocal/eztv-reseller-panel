
import React from 'react';
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

// Form schema with validation - only allow 1, 3, 6, or 12 months
const formSchema = z.object({
  planDuration: z.enum(['1', '3', '6', '12'], {
    required_error: 'Please select a plan duration.',
  }).transform(val => parseInt(val)),
});

type FormData = z.infer<typeof formSchema>;

interface RenewCustomerFormProps {
  customer: Customer;
  onSuccess?: () => void;
}

export function RenewCustomerForm({ customer, onSuccess }: RenewCustomerFormProps) {
  const { user } = useAuth();
  const { renewCustomer, resellers } = useApp();
  
  // Get current reseller to show available credits
  const currentReseller = resellers.find(r => r.id === user?.id);
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      planDuration: 1,
    },
  });

  // Watch plan duration to show real-time credit calculation
  const planDuration = form.watch('planDuration');

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You need to be logged in to renew a subscription.');
      return;
    }

    // Check credits before attempting renewal
    if (currentReseller && currentReseller.credits < data.planDuration) {
      toast.error(`Insufficient credits. You need ${data.planDuration} credits but only have ${currentReseller.credits}.`);
      return;
    }
    
    try {
      console.log(`🔄 RenewCustomerForm: Starting renewal for ${customer.name}`);
      
      const success = await renewCustomer(customer, data.planDuration);
      
      if (success) {
        console.log(`✅ RenewCustomerForm: Renewal successful for ${customer.name}`);
        form.reset();
        if (onSuccess) onSuccess();
      } else {
        console.error(`❌ RenewCustomerForm: Renewal failed for ${customer.name}`);
        // Error toast is already shown by AppContext
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
              <p className="text-xs text-gray-500">MAC Address</p>
              <p className="text-sm font-mono">{customer.macAddress}</p>
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
              <span className="text-sm font-semibold text-blue-900">{planDuration || 0}</span>
            </div>
            <div className="mt-1 flex justify-between items-center border-t border-blue-200 pt-2">
              <span className="text-sm text-blue-700">Remaining After Renewal:</span>
              <span className={`text-sm font-semibold ${
                (currentReseller.credits - (planDuration || 0)) >= 0 ? 'text-green-700' : 'text-red-700'
              }`}>
                {currentReseller.credits - (planDuration || 0)}
              </span>
            </div>
          </div>
        )}
        
        <FormField
          control={form.control}
          name="planDuration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plan Duration</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
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
                This will consume {field.value || 0} credit{field.value !== 1 ? 's' : ''} and extend the subscription accordingly.
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
            disabled={currentReseller && currentReseller.credits < planDuration}
          >
            {currentReseller && currentReseller.credits < planDuration 
              ? 'Insufficient Credits' 
              : 'Renew Subscription'
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}
