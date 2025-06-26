
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface AccountFormData {
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function AccountUpdateForm() {
  const { user } = useAuth();
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors }
  } = useForm<AccountFormData>({
    defaultValues: {
      email: user?.email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  });

  const newPassword = watch('newPassword');

  const handleEmailUpdate = async (data: AccountFormData) => {
    if (!data.email || data.email === user?.email) {
      toast.info('No changes to email address');
      return;
    }

    setIsUpdatingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: data.email });
      
      if (error) {
        toast.error(`Failed to update email: ${error.message}`);
      } else {
        toast.success('Email update initiated! Please check your new email for confirmation.');
        // Update the profiles table as well
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ email: data.email })
          .eq('id', user?.id);
        
        if (profileError) {
          console.error('Profile update error:', profileError);
        }
      }
    } catch (error: any) {
      toast.error('An unexpected error occurred while updating email');
      console.error('Email update error:', error);
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handlePasswordUpdate = async (data: AccountFormData) => {
    if (!data.newPassword || data.newPassword !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (data.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ 
        password: data.newPassword 
      });
      
      if (error) {
        toast.error(`Failed to update password: ${error.message}`);
      } else {
        toast.success('Password updated successfully!');
        // Clear password fields
        reset({
          email: data.email,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      }
    } catch (error: any) {
      toast.error('An unexpected error occurred while updating password');
      console.error('Password update error:', error);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Email Update Form */}
      <Card>
        <CardHeader>
          <CardTitle>Update Email Address</CardTitle>
          <CardDescription>
            Change your account email address. You'll need to verify the new email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleEmailUpdate)} className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                {...register('email', { 
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                })}
                className="mt-1"
              />
              {errors.email && (
                <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>
            <Button 
              type="submit" 
              disabled={isUpdatingEmail}
              className="w-full sm:w-auto"
            >
              {isUpdatingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Email
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password Update Form */}
      <Card>
        <CardHeader>
          <CardTitle>Update Password</CardTitle>
          <CardDescription>
            Change your account password. Choose a strong password for better security.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handlePasswordUpdate)} className="space-y-4">
            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                {...register('newPassword', { 
                  required: 'New password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  }
                })}
                className="mt-1"
              />
              {errors.newPassword && (
                <p className="text-sm text-red-500 mt-1">{errors.newPassword.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...register('confirmPassword', { 
                  required: 'Please confirm your password',
                  validate: value => value === newPassword || 'Passwords do not match'
                })}
                className="mt-1"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-500 mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>
            
            <Button 
              type="submit" 
              disabled={isUpdatingPassword}
              className="w-full sm:w-auto"
            >
              {isUpdatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
