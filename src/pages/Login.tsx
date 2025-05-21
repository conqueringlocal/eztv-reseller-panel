
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// Form schema
const formSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof formSchema>;

export default function Login() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
  // Initialize form
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
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
  
  // Handle form submission
  const onSubmit = async (data: FormData) => {
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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
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
                  {isLoading ? 'Loading...' : 'Login'}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="justify-center border-t pt-4 text-xs text-gray-500">
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
