
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

// Form schema
const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

type FormData = z.infer<typeof formSchema>;

// Demo account credentials - consistent across the app
const DEMO_EMAIL = 'admin@demo.com';
const DEMO_PASSWORD = 'Admin123!';

export default function AdminSetup() {
  const [isLoading, setIsLoading] = useState(false);
  const [checkingAdmins, setCheckingAdmins] = useState(true);
  const [adminExists, setAdminExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Create demo admin account
  const createDemoAdmin = async () => {
    try {
      console.log('Creating demo admin account...');
      toast.info('Setting up demo admin account...');
      
      // Sign out any existing session
      await supabase.auth.signOut({ scope: 'global' });
      
      // Check if demo account already exists
      const { data: existingUsers } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', DEMO_EMAIL);
      
      if (existingUsers && existingUsers.length > 0) {
        console.log('Demo admin account already exists');
        toast.success('Demo admin account is ready');
        return true;
      }
      
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        options: {
          data: {
            name: 'Demo Admin',
            role: 'admin'
          }
        }
      });

      if (authError) {
        console.error('Error creating demo auth user:', authError);
        toast.error('Failed to create demo account: ' + authError.message);
        return false;
      }

      console.log('Demo auth created successfully:', authData?.user?.id);
      toast.success('Demo admin account created successfully');
      return true;
    } catch (error: any) {
      console.error('Error creating demo admin:', error);
      toast.error('Error creating demo admin: ' + (error?.message || 'Unknown error'));
      return false;
    }
  };

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
          
          // Create demo account if there's an error
          await createDemoAdmin();
          setCheckingAdmins(false);
          return;
        }

        console.log('Admin check result:', { data, count });

        if (count && count > 0) {
          console.log('Admin accounts found:', count);
          setAdminExists(true);
          navigate('/login');
        } else {
          console.log('No admin accounts found, showing admin setup form');
          // Create demo admin account automatically
          await createDemoAdmin();
        }
      } catch (error) {
        console.error('Error in admin check:', error);
        
        // Create demo account if there's an error
        await createDemoAdmin();
      } finally {
        setCheckingAdmins(false);
      }
    };

    checkForAdmins();
  }, [navigate]);

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Creating admin with data:', { ...data, role: 'admin' });
      
      // Sign out any existing session
      await supabase.auth.signOut({ scope: 'global' });
      
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
        }, 2000);
      } else {
        setError('Failed to create admin account - please try again or use demo credentials');
        toast.error('Failed to create admin account');
      }
    } catch (error: any) {
      console.error('Error creating admin:', error);
      setError('An unexpected error occurred: ' + (error?.message || 'Unknown error'));
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Use demo account
  const useDemo = async () => {
    toast.info('Signing in with demo admin account...');
    setIsLoading(true);
    
    try {
      // First ensure we're logged out
      await supabase.auth.signOut({ scope: 'global' });
      
      // Ensure demo account exists
      const demoExists = await createDemoAdmin();
      
      if (!demoExists) {
        setError('Failed to set up demo account. Please try again.');
        setIsLoading(false);
        return;
      }
      
      // Wait a moment to make sure everything is set up
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to authenticate with demo credentials
      const { data, error } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD
      });
      
      if (error) {
        console.error('Demo login error:', error);
        setError('Demo login failed: ' + error.message);
        toast.error('Demo login failed: ' + error.message);
        return;
      }
      
      if (data.user) {
        toast.success('Demo login successful!');
        setTimeout(() => navigate('/admin'), 500);
      }
    } catch (demoError: any) {
      console.error('Demo auth error:', demoError);
      setError('Error using demo account: ' + (demoError?.message || 'Unknown error'));
      toast.error('Error using demo account');
    } finally {
      setIsLoading(false);
    }
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
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
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
                  <p>Or use our demo admin account:</p>
                  <p className="font-semibold mt-1">Email: {DEMO_EMAIL}</p>
                  <p className="font-semibold">Password: {DEMO_PASSWORD}</p>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="mt-2 w-full" 
                    onClick={useDemo}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing in...' : 'Use Demo Account'}
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
