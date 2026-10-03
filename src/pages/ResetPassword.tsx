
import React, { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

// Form schema
const formSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof formSchema>;

export default function ResetPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const checkResetToken = () => {
      setError(null);
      
      // Parse URL fragments (hash parameters) for Supabase password reset
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      
      console.log("Reset flow debug:");
      
      if (!accessToken || !refreshToken || type !== 'recovery') {
        console.error("Invalid recovery parameters in URL hash");
        setError('Invalid or expired reset link. Please request a new password reset.');
        return;
      }

      // Set the session with the tokens from the URL
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }).then(({ error }) => {
        if (error) {
          console.error("Error setting session:");
          setError('Failed to validate reset link. Please request a new password reset.');
        } else {
          console.log("Session set successfully for password reset");
        }
      });
    };

    checkResetToken();
  }, []);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Update the user's password
      const { error } = await supabase.auth.updateUser({
        password: data.password
      });

      if (error) {
        console.error("Error updating password:");
        setError(error.message);
        return;
      }

      toast.success('Password updated successfully!');
      
      // Sign out to clear the session after password reset
      await supabase.auth.signOut();
      
      navigate('/login');
    } catch (error: any) {
      console.error("Error updating password:");
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-eztv-700">EZTV Club</h1>
          <p className="text-gray-600 mt-2">Reset Your Password</p>
        </div>
        
        <Card className="w-full shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Set New Password</CardTitle>
            <CardDescription className="text-center">
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
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
                
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
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
                  disabled={isLoading || !!error}
                >
                  {isLoading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
