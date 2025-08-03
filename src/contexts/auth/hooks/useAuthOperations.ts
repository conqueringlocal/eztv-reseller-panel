
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";
import { UserRole } from '../types';
import { useSecurityAudit } from '@/hooks/useSecurityAudit';
import { useRateLimit } from '@/hooks/useRateLimit';

export const useAuthOperations = () => {
  const { logFailedLogin, logSuccessfulLogin, logPasswordReset } = useSecurityAudit();
  const { checkRateLimit } = useRateLimit();

  const signup = async (email: string, password: string, name: string, role: UserRole = 'reseller'): Promise<boolean> => {
    try {
      console.log('📝 Attempting signup for:', email, 'with role:', role);
      
      // Sign up with email/password
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role
          }
        }
      });
      
      if (error) {
        console.error('❌ Signup error:', error);
        toast.error(error.message);
        return false;
      }

      if (!data.user) {
        toast.error('Failed to create user');
        return false;
      }
      
      console.log('✅ Signup successful for user:', data.user.id);
      toast.success(`Account created successfully!`);
      return true;
    } catch (error: any) {
      console.error('💥 Signup error:', error);
      toast.error('An unexpected error occurred during signup');
      return false;
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    console.log('🔐 Starting login process for:', email);
    
    // Check rate limiting first
    const rateLimitAllowed = await checkRateLimit(email, 'login_failed', {
      maxAttempts: 5,
      windowMinutes: 15
    });

    if (!rateLimitAllowed) {
      toast.error('Too many failed login attempts. Please try again in 15 minutes.');
      return false;
    }
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('❌ Login error:', error);
        
        // Log failed login attempt
        logFailedLogin(email, error.message);
        
        if (error.message?.includes('Invalid login credentials')) {
          toast.error('Invalid email or password. Please check your credentials and try again.');
        } else if (error.message?.includes('Email not confirmed')) {
          toast.error('Please check your email and click the confirmation link before logging in.');
        } else {
          toast.error(`Login failed: ${error.message}`);
        }
        
        return false;
      }

      if (!data?.user) {
        console.error('❌ No user data returned');
        logFailedLogin(email, 'No user data returned');
        toast.error('Login failed: No user data received');
        return false;
      }

      console.log('✅ Login successful for user:', data.user.email);
      // Log successful login
      logSuccessfulLogin(email);
      toast.success('Successfully logged in!');
      return true;
      
    } catch (error) {
      console.error('❌ Unexpected login error:', error);
      logFailedLogin(email, 'Unexpected error');
      toast.error('An unexpected error occurred during login. Please try again.');
      return false;
    }
  };

  const logout = async (setUser: (user: any) => void) => {
    try {
      console.log('👋 Starting logout process');
      
      // Clear user state immediately
      setUser(null);
      
      // Simple sign out
      await supabase.auth.signOut();
      
      console.log('✅ Logout completed successfully');
      toast.info('You have been logged out');
    } catch (error) {
      console.error('❌ Logout error:', error);
      toast.error('Error during logout');
      
      // Even if logout fails, ensure state is cleaned
      setUser(null);
    }
  };

  return {
    signup,
    login,
    logout
  };
};
