
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
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Customer } from '@/contexts/AppContext';

// Form schema with validation
const formSchema = z.object({
  planDuration: z.coerce
    .number()
    .int()
    .min(1, { message: 'Plan duration must be at least 1 month.' })
    .max(12, { message: 'Plan duration cannot exceed 12 months.' }),
});

type FormData = z.infer<typeof formSchema>;

interface RenewCustomerFormProps {
  customer: Customer;
  onSuccess?: () => void;
}

export function RenewCustomerForm({ customer, onSuccess }: RenewCustomerFormProps) {
  const { user } = useAuth();
  const { renewCustomer } = useApp();
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      planDuration: 1,
    },
  });

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You need to be logged in to renew a subscription.');
      return;
    }
    
    try {
      const success = await renewCustomer(customer.id, data.planDuration);
      
      if (success) {
        toast.success(`Subscription renewed for ${data.planDuration} ${data.planDuration === 1 ? 'month' : 'months'}!`);
        form.reset();
        if (onSuccess) onSuccess();
      } else {
        toast.error('Failed to renew subscription. Please check your credits balance.');
      }
    } catch (error) {
      toast.error('An error occurred while renewing the subscription.');
      console.error(error);
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
          </div>
        </div>
        
        <FormField
          control={form.control}
          name="planDuration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plan Duration (Months)</FormLabel>
              <FormControl>
                <Input type="number" min="1" max="12" {...field} />
              </FormControl>
              <FormDescription>
                This will consume {field.value || 0} credit{field.value !== 1 ? 's' : ''}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onSuccess}>
            Cancel
          </Button>
          <Button type="submit">Renew Subscription</Button>
        </div>
      </form>
    </Form>
  );
}
