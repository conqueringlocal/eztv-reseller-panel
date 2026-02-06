
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { ProviderSelect } from './ProviderSelect';

const formSchema = z.object({
  name: z.string().min(2, 'Customer name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  deviceType: z.string().min(1, 'Device type is required'),
  provider: z.enum(['trex'], {
    required_error: 'Please select a provider',
  }),
});

type FormData = z.infer<typeof formSchema>;

interface CreateTrialWithProviderFormProps {
  onSuccess: () => void;
}

export function CreateTrialWithProviderForm({ onSuccess }: CreateTrialWithProviderFormProps) {
  const { user } = useAuth();
  const { refreshData } = useApp();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      deviceType: 'Smart TV',
      provider: 'trex',
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You must be logged in to create trial accounts');
      return;
    }

    setIsLoading(true);
    console.log(`🎯 Creating 24-hour trial account for: ${data.name} with provider: ${data.provider}`);

    try {
      // Both providers use the same trial function
      const functionName = 'create-trial-user';
      
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
        console.error(`❌ Error creating ${data.provider} trial account:`, error);
        toast.error(`Failed to create ${data.provider} trial account`);
        setIsLoading(false);
        return;
      }

      if (!result.success) {
        console.error(`❌ ${data.provider} trial creation failed:`, result.error);
        toast.error(result.error || `Failed to create ${data.provider} trial account`);
        setIsLoading(false);
        return;
      }

      console.log(`✅ ${data.provider} trial account created successfully:`, result);
      toast.success(`24-hour ${data.provider} trial account created successfully!`);
      
      // Refresh data to show the new trial customer
      await refreshData();
      
      // Reset form and close dialog
      form.reset();
      onSuccess();
      
    } catch (error) {
      console.error(`💥 Unexpected error creating ${data.provider} trial:`, error);
      toast.error('An error occurred while creating the trial account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>IPTV Provider</FormLabel>
              <FormControl>
                <ProviderSelect
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isLoading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
            <li>• MAC address will be generated from customer name</li>
            <li>• Customer will receive login details via CRM (if configured)</li>
            <li>• Daily trial limits apply per provider</li>
          </ul>
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating Trial...' : 'Create 24-Hour Trial'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
