
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const addResellerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  credits: z.number().min(0, 'Credits must be a positive number').default(0),
});

type AddResellerFormData = z.infer<typeof addResellerSchema>;

interface AddResellerFormProps {
  onSuccess: () => void;
}

export function AddResellerForm({ onSuccess }: AddResellerFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<AddResellerFormData>({
    resolver: zodResolver(addResellerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      credits: 0,
    },
  });

  const onSubmit = async (data: AddResellerFormData) => {
    setIsLoading(true);
    try {
      // Create the user account in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        user_metadata: {
          name: data.name,
          role: 'reseller'
        }
      });

      if (authError) {
        console.error('Auth error:', authError);
        toast.error(`Failed to create reseller account: ${authError.message}`);
        return;
      }

      if (!authData.user) {
        toast.error('Failed to create user account');
        return;
      }

      // Update the profile with the correct credits
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          credits: data.credits,
          name: data.name 
        })
        .eq('id', authData.user.id);

      if (profileError) {
        console.error('Profile error:', profileError);
        toast.error(`Failed to update reseller profile: ${profileError.message}`);
        return;
      }

      toast.success('Reseller added successfully');
      form.reset();
      onSuccess();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast.error('An unexpected error occurred');
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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter reseller name" {...field} />
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
                <Input placeholder="Enter email address" type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input placeholder="Enter password" type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="credits"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Initial Credits</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Enter initial credits" 
                  type="number" 
                  min="0"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button 
            type="submit" 
            disabled={isLoading}
            className="bg-eztv-700 hover:bg-eztv-800"
          >
            {isLoading ? 'Adding...' : 'Add Reseller'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
