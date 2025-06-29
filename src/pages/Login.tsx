
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  // Get the current site URL for redirection
  const getSiteUrl = () => {
    return window.location.origin;
  };

  // Handle password reset
  const onResetSubmit = async (data: ResetFormData) => {
    setIsResetLoading(true);
    try {
      const redirectTo = `${getSiteUrl()}/reset-password`;
      console.log(`Setting redirect URL to: ${redirectTo}`);
      
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password reset email sent! Check your inbox and click the link to reset your password.');
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-4">
      <div className="w-full max-w-md">
        {/* Enhanced Brand Header */}
        <div className="text-center mb-8">
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <img 
                src="/lovable-uploads/f71dcfeb-b101-4ccc-abc8-d4e8bb8811a4.png" 
                alt="EZTV Club Logo" 
                className="h-20 w-auto object-contain drop-shadow-lg"
              />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-eztv-600 to-eztv-800 bg-clip-text text-transparent mb-2">
            EZTV Club
          </h1>
          <p className="text-gray-600 font-medium text-lg">Reseller Dashboard</p>
          <div className="mt-3 h-1 w-24 bg-gradient-to-r from-eztv-500 to-eztv-700 mx-auto rounded-full"></div>
        </div>
        
        <Card className="w-full shadow-2xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="text-center pb-6 pt-8">
            <CardTitle className="text-2xl text-eztv-700 mb-2">Welcome Back</CardTitle>
            <CardDescription className="text-center text-gray-600">
              Sign in to access your reseller dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5">
                <FormField
                  control={loginForm.control}
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
                  control={loginForm.control}
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

                <div className="text-center pt-4">
                  <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="link" className="text-sm text-eztv-600 hover:text-eztv-700 transition-colors font-medium">
                        Forgot your password?
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-eztv-700">Reset Password</DialogTitle>
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
                                <FormLabel className="text-eztv-800 font-semibold">Email Address</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Enter your email address" 
                                    type="email" 
                                    className="border-eztv-200 focus:border-eztv-500 focus:ring-eztv-500/20"
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex justify-end space-x-2 pt-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={() => setResetDialogOpen(false)}
                              className="border-eztv-200 text-eztv-700 hover:bg-eztv-50"
                            >
                              Cancel
                            </Button>
                            <Button 
                              type="submit" 
                              disabled={isResetLoading}
                              className="bg-gradient-to-r from-eztv-600 to-eztv-700 hover:from-eztv-700 hover:to-eztv-800"
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
        </Card>
        
        {/* Subtle footer branding */}
        <div className="text-center mt-6 text-sm text-gray-500">
          Powered by EZTV Club Platform
        </div>
      </div>
    </div>
  );
}
