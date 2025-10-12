
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { checkForExistingCustomer } from '@/utils/customerConsolidation/duplicateDetection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(2, 'Customer name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  deviceType: z.string().min(1, 'Device type is required'),
});

type FormData = z.infer<typeof formSchema>;

interface CreateTrialFormProps {
  onSuccess: () => void;
}

export function CreateTrialForm({ onSuccess }: CreateTrialFormProps) {
  const { user } = useAuth();
  const { refreshData, customers } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateCustomer, setDuplicateCustomer] = useState<any>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      deviceType: 'Smart TV',
    },
  });
  
  // Watch name and email for duplicate detection
  const watchName = form.watch('name');
  const watchEmail = form.watch('email');
  
  // Check for duplicates when name or email changes
  useEffect(() => {
    if (watchName && watchEmail) {
      const existing = checkForExistingCustomer(
        watchName, 
        watchEmail, 
        customers.filter(c => c.resellerId === user?.id)
      );
      setDuplicateCustomer(existing);
    } else {
      setDuplicateCustomer(null);
    }
  }, [watchName, watchEmail, customers, user?.id]);

  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You must be logged in to create trial accounts');
      return;
    }

    // Use the reseller's assigned provider for backend routing
    const provider = user.provider || '8k'; // Default to '8k' if no provider is set

    setIsLoading(true);
    console.log(`🎯 Creating 24-hour trial account for: ${data.name} with provider: ${provider}`);

    try {
      // Call the unified trial creation function for all providers
      const functionName = 'create-trial-user';
      
      console.log(`📞 Calling function: ${functionName}`);
      
      const { data: result, error } = await supabase.functions.invoke(functionName, {
        body: {
          customerData: {
            name: data.name,
            email: data.email,
            deviceType: data.deviceType,
          },
          resellerId: user.id,
        },
      });

      if (error) {
        console.error(`❌ Error creating trial account:`, error);
        toast.error(`Failed to create trial account: ${error.message}`);
        return;
      }

      if (!result.success) {
        console.error(`❌ Trial creation failed:`, result.error);
        toast.error(result.error || `Failed to create trial account`);
        return;
      }

      console.log(`✅ Trial account created successfully:`, result);
      toast.success(`24-hour EZTV trial account created successfully!`);
      
      // Refresh data to show the new trial customer
      await refreshData();
      
      // Reset form and close dialog
      form.reset();
      onSuccess();
      
    } catch (error) {
      console.error(`💥 Unexpected error creating trial:`, error);
      toast.error('An error occurred while creating the trial account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Duplicate customer warning */}
        {duplicateCustomer && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Duplicate Customer Detected</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                A customer with similar information already exists:
              </p>
              <div className="bg-red-50 p-2 rounded border border-red-200">
                <p className="text-sm"><strong>Name:</strong> {duplicateCustomer.name}</p>
                <p className="text-sm"><strong>Email:</strong> {duplicateCustomer.email}</p>
                <p className="text-sm"><strong>Status:</strong> {duplicateCustomer.status}</p>
              </div>
              <p className="mt-2 text-sm font-semibold">
                Creating a trial for an existing customer may cause issues. 
                Please verify this is a different customer before proceeding.
              </p>
            </AlertDescription>
          </Alert>
        )}
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h4 className="font-medium text-green-800 mb-2">EZTV Trial Information</h4>
          <p className="text-sm text-green-700">
            Trial will be created using our premium streaming service platform
          </p>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Customer Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter customer name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="customer@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="deviceType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Device Type</FormLabel>
              <FormControl>
                <Input placeholder="Smart TV, Android Box, etc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-800 mb-2">Trial Account Information</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Trial duration: 24 hours from creation</li>
            <li>• No credits will be consumed</li>
            <li>• Credentials will be automatically generated</li>
            <li>• Uses premium EZTV streaming service</li>
            <li>• Customer will receive login details via CRM (if configured)</li>
            <li>• Daily trial limits apply per account</li>
          </ul>
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={() => form.reset()} disabled={isLoading}>
            Reset
          </Button>
          <Button type="submit" disabled={isLoading || !form.formState.isValid}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Trial...
              </>
            ) : (
              `Create 24-Hour EZTV Trial`
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
