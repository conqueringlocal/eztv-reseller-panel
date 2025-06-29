
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSubmit: (data: LoginFormData) => Promise<void>;
  isLoading: boolean;
}

export function LoginForm({ onSubmit, isLoading }: LoginFormProps) {
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleSubmit = async (data: LoginFormData) => {
    console.log('🔐 LoginForm: Submitting login for:', data.email);
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('❌ LoginForm: Error during login:', error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-eztv-800 font-semibold">Email Address</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Enter your email address" 
                  type="email" 
                  className="h-12 border-eztv-200 focus:border-eztv-500 focus:ring-eztv-500/20 transition-all duration-200"
                  {...field} 
                />
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
              <FormLabel className="text-eztv-800 font-semibold">Password</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Enter your password" 
                  type="password" 
                  className="h-12 border-eztv-200 focus:border-eztv-500 focus:ring-eztv-500/20 transition-all duration-200"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button 
          type="submit" 
          className="w-full h-12 bg-gradient-to-r from-eztv-600 to-eztv-700 hover:from-eztv-700 hover:to-eztv-800 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200" 
          disabled={isLoading}
        >
          {isLoading ? 'Signing In...' : 'Sign In to Dashboard'}
        </Button>
      </form>
    </Form>
  );
}
