
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const resetSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
});

type ResetFormData = z.infer<typeof resetSchema>;

export function PasswordResetDialog() {
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  
  const resetForm = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      email: '',
    },
  });

  const getSiteUrl = () => {
    return window.location.origin;
  };

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
  );
}
