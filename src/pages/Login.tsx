
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

// Form schemas
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required'),
});

const resetSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type ResetFormData = z.infer<typeof resetSchema>;

export default function Login() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [checkingAdmins, setCheckingAdmins] = useState(true);
  const [adminExists, setAdminExists] = useState(true);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  
  // Initialize forms
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const resetForm = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      email: '',
    },
  });
  
  // Check if admin exists
  useEffect(() => {
    const checkForAdmins = async () => {
      try {
        const { data, error, count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact' })
          .eq('role', 'admin');

        if (error) {
          console.error('Error checking for admins:', error);
          return;
        }

        setAdminExists(!!count && count > 0);
      } catch (error) {
        console.error('Error in admin check:', error);
      } finally {
        setCheckingAdmins(false);
      }
    };

    checkForAdmins();
  }, []);
  
  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      if (user?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/reseller');
      }
    }
  }, [isAuthenticated, navigate, user]);
  
  // Handle login form submission
  const onLoginSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const success = await login(data.email, data.password);
      if (success) {
        // Auth context will handle the redirect
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password reset
  const onResetSubmit = async (data: ResetFormData) => {
    setIsResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password reset email sent! Check your inbox.');
        setResetDialogOpen(false);
        resetForm.reset();
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsResetLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-eztv-700">EZTV Club</h1>
          <p className="text-gray-600 mt-2">Reseller Dashboard</p>
        </div>
        
        <Card className="w-full shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Login</CardTitle>
            <CardDescription className="text-center">
              Enter your email and password to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="name@example.com" 
                          type="email" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={loginForm.control}
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
                  {isLoading ? 'Loading...' : 'Login'}
                </Button>

                <div className="text-center">
                  <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="link" className="text-sm text-eztv-700 hover:underline">
                        Forgot your password?
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Reset Password</DialogTitle>
                        <DialogDescription>
                          Enter your email address and we'll send you a link to reset your password.
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...resetForm}>
                        <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
                          <FormField
                            control={resetForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="name@example.com" 
                                    type="email" 
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex justify-end space-x-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={() => setResetDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button 
                              type="submit" 
                              disabled={isResetLoading}
                              className="bg-eztv-700 hover:bg-eztv-800"
                            >
                              {isResetLoading ? 'Sending...' : 'Send Reset Link'}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col justify-center border-t pt-4 text-xs text-gray-500">
            {!checkingAdmins && !adminExists && (
              <div className="mb-3 text-center">
                <p className="text-sm">No admin account found.</p>
                <Link to="/admin-setup" className="text-eztv-700 hover:underline text-sm font-medium">
                  Set up admin account →
                </Link>
              </div>
            )}
            <div>
              <p>For demo purposes:</p>
              <p>Admin: admin@eztv.club / admin123</p>
              <p>Reseller: reseller@eztv.club / reseller123</p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
