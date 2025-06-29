
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";
import { UserRole } from '../types';
import { cleanupAuthState } from '../utils';

export const useAuthOperations = () => {
  const signup = async (email: string, password: string, name: string, role: UserRole = 'reseller'): Promise<boolean> => {
    try {
      // Clean up existing state
      cleanupAuthState();
      
      console.log('Attempting signup for:', email, 'with role:', role);
      
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
        toast.error(error.message);
        return false;
      }

      if (!data.user) {
        toast.error('Failed to create user');
        return false;
      }
      
      console.log('Signup successful for user:', data.user.id);
      toast.success(`Account created successfully!`);
      return true;
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Clean up existing state
      cleanupAuthState();
      
      // Attempt global sign out
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        console.error('Error during global sign out:', err);
      }
      
      console.log('Attempting login for:', email);
      
      // Sign in with email/password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        toast.error(error.message);
        return false;
      }

      if (data.user) {
        console.log('Login successful for user:', data.user.id);
        toast.success(`Welcome back!`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const logout = async (setUser: (user: any) => void) => {
    try {
      // Clean up auth state
      cleanupAuthState();
      
      console.log('Logging out');
      
      // Attempt global sign out
      await supabase.auth.signOut({ scope: 'global' });
      
      // Clear user state
      setUser(null);
      
      toast.info('You have been logged out');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Error during logout');
    }
  };

  return {
    signup,
    login,
    logout
  };
};
