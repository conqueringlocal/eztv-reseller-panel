import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Mail, Loader2 } from 'lucide-react';
import { useSecurityAudit } from '@/hooks/useSecurityAudit';
import { useRateLimit } from '@/hooks/useRateLimit';

interface PasswordResetFormProps {
  onBack: () => void;
}

export const PasswordResetForm: React.FC<PasswordResetFormProps> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { logPasswordReset } = useSecurityAudit();
  const { checkRateLimit, isBlocked, getRemainingTime } = useRateLimit();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    // Check rate limiting
    const rateLimitAllowed = await checkRateLimit(email, 'password_reset', {
      maxAttempts: 3,
      windowMinutes: 60
    });

    if (!rateLimitAllowed) {
      const remainingTime = Math.ceil(getRemainingTime() / 60);
      toast.error(`Too many password reset attempts. Please try again in ${remainingTime} minutes.`);
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast.error(`Error: ${error.message}`);
        return;
      }

      // Log the password reset request
      logPasswordReset(email);
      
      setIsSuccess(true);
      toast.success('Password reset email sent successfully!');
    } catch (error) {
      console.error('Password reset error:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-4 p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <Mail className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Check Your Email</h3>
          <p className="text-sm text-gray-600 mb-4">
            We've sent a password reset link to {email}
          </p>
        </div>
        
        <Alert>
          <AlertDescription>
            If you don't see the email in your inbox, please check your spam folder. 
            The link will expire in 24 hours for security purposes.
          </AlertDescription>
        </Alert>
        
        <Button onClick={onBack} className="w-full">
          Back to Login
        </Button>
      </div>
    );
  }

  const remainingTime = Math.ceil(getRemainingTime() / 60);

  return (
    <div className="space-y-4 p-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Reset Your Password</h3>
        <p className="text-sm text-gray-600">
          Enter your email address and we'll send you a link to reset your password
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading || isBlocked}
            required
          />
        </div>

        {isBlocked && (
          <Alert variant="destructive">
            <AlertDescription>
              Too many reset attempts. Please wait {remainingTime} minutes before trying again.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || isBlocked}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending Reset Link...
              </>
            ) : (
              'Send Reset Link'
            )}
          </Button>
          
          <Button 
            type="button"
            variant="outline" 
            className="w-full" 
            onClick={onBack}
            disabled={isLoading}
          >
            Back to Login
          </Button>
        </div>
      </form>
    </div>
  );
};