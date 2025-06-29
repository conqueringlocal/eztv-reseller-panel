
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";
import { UserRole } from '../types';

export const useAuthOperations = () => {
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
    try {
      console.log('🔐 Starting login process for:', email);
      
      // Simple login without aggressive cleanup
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error('❌ Login error:', error);
        
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Invalid email or password');
        } else {
          toast.error(error.message);
        }
        return false;
      }

      if (data.user && data.session) {
        console.log('✅ Login successful for user:', data.user.id);
        toast.success(`Welcome back!`);
        return true;
      }

      toast.error('Login failed - no user data received');
      return false;
    } catch (error) {
      console.error('💥 Login error:', error);
      toast.error('An unexpected error occurred during login');
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
