
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';

const formSchema = z.object({
  name: z.string().min(2, 'Customer name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  macAddress: z.string().min(12, 'MAC address must be at least 12 characters').regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/, 'Please enter a valid MAC address'),
  deviceType: z.string().min(1, 'Device type is required'),
});

type FormData = z.infer<typeof formSchema>;

interface CreateTrialFormProps {
  onSuccess: () => void;
}

export function CreateTrialForm({ onSuccess }: CreateTrialFormProps) {
  const { user } = useAuth();
  const { refreshData } = useApp();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      macAddress: '',
      deviceType: 'Smart TV',
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You must be logged in to create trial accounts');
      return;
    }

    setIsLoading(true);
    console.log('🎯 Creating 24-hour trial account for:', data.name);

    try {
      // Call the create-trial-user edge function
      const { data: result, error } = await supabase.functions.invoke('create-trial-user', {
        body: {
          customerData: {
            name: data.name,
            email: data.email,
            macAddress: data.macAddress,
            deviceType: data.deviceType,
          },
          resellerId: user.id,
        },
      });

      if (error) {
        console.error('❌ Error creating trial account:', error);
        toast.error('Failed to create trial account');
        return;
      }

      if (!result.success) {
        console.error('❌ Trial creation failed:', result.error);
        toast.error(result.error || 'Failed to create trial account');
        return;
      }

      console.log('✅ Trial account created successfully:', result);
      toast.success('24-hour trial account created successfully!');
      
      // Refresh data to show the new trial customer
      await refreshData();
      
      // Reset form and close dialog
      form.reset();
      onSuccess();
      
    } catch (error) {
      console.error('💥 Unexpected error creating trial:', error);
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
          name="macAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>MAC Address</FormLabel>
              <FormControl>
                <Input placeholder="00:11:22:33:44:55" {...field} />
              </FormControl>
              <FormDescription>
                The unique MAC address of the customer's device
              </FormDescription>
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
            <li>• Customer will receive login details via CRM (if configured)</li>
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
