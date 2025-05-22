
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from "sonner";
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// Form schema
const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

type FormData = z.infer<typeof formSchema>;

export default function AdminSetup() {
  const [isLoading, setIsLoading] = useState(false);
  const [checkingAdmins, setCheckingAdmins] = useState(true);
  const [adminExists, setAdminExists] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  // Initialize form
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  // Check if admin exists
  useEffect(() => {
    const checkForAdmins = async () => {
      try {
        console.log('Checking for existing admin accounts...');
        const { data, error, count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact' })
          .eq('role', 'admin');

        if (error) {
          console.error('Error checking for admins:', error);
          toast.error('Error checking for admin accounts');
          return;
        }

        console.log('Admin check result:', { data, count });

        if (count && count > 0) {
          console.log('Admin accounts found:', count);
          setAdminExists(true);
          navigate('/login');
        } else {
          console.log('No admin accounts found, showing admin setup form');
        }
      } catch (error) {
        console.error('Error in admin check:', error);
      } finally {
        setCheckingAdmins(false);
      }
    };

    checkForAdmins();
  }, [navigate]);

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      console.log('Creating admin with data:', { ...data, role: 'admin' });
      
      // First, let's ensure the user_role type exists and profiles table is ready
      try {
        // This query will fail if user_role already exists, which is fine
        await supabase.rpc('create_role_type_if_not_exists');
      } catch (error) {
        console.log('Initialization RPC failed or not defined, continuing...');
      }
      
      const success = await register(
        data.email,
        data.password,
        data.name,
        'admin'
      );

      if (success) {
        toast.success('Admin account created successfully!');
        
        // Wait a moment for database to update
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        // Try direct creation as a fallback
        try {
          // First create auth user
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
              data: {
                name: data.name,
                role: 'admin'
              }
            }
          });

          if (authError) throw authError;
          
          if (authData.user) {
            // Then manually create profile
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({
                id: authData.user.id,
                name: data.name,
                email: data.email,
                role: 'admin',
                credits: 0
              });
              
            if (profileError) {
              console.error('Manual profile creation error:', profileError);
              toast.error('Profile creation failed: ' + profileError.message);
            } else {
              toast.success('Admin created successfully via fallback method!');
              setTimeout(() => navigate('/login'), 3000);
              return;
            }
          }
        } catch (fallbackError) {
          console.error('Fallback creation error:', fallbackError);
        }
        
        toast.error('Failed to create admin account - please use demo credentials');
        console.error('Admin registration returned false');
      }
    } catch (error) {
      console.error('Error creating admin:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Use demo account if needed
  const useDemo = () => {
    toast.info('Using demo admin account. Redirecting...');
    setTimeout(() => {
      navigate('/login');
    }, 1500);
  };

  if (checkingAdmins) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eztv-600"></div>
      </div>
    );
  }

  if (adminExists) {
    return null; // This will redirect via the useEffect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-eztv-700">EZTV Club</h1>
          <p className="text-gray-600 mt-2">Initial Admin Setup</p>
        </div>
        
        <Card className="w-full shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Create Admin Account</CardTitle>
            <CardDescription className="text-center">
              Set up the first administrator account for your application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Admin Name" {...field} />
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
                        <Input 
                          placeholder="admin@example.com" 
                          type="email" 
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="••••••••" 
                          type="password" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full bg-eztv-700 hover:bg-eztv-800" 
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create Admin Account'}
                </Button>

                <div className="text-center mt-4 text-sm text-gray-500">
                  <p>If you continue to have issues, you can use these demo credentials:</p>
                  <p className="font-semibold mt-1">Email: admin@demo.com</p>
                  <p className="font-semibold">Password: Admin123!</p>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="mt-2 w-full" 
                    onClick={useDemo}
                  >
                    Use Demo Account
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
