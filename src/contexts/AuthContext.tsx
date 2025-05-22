
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";

// Define types for our context
export type UserRole = 'admin' | 'reseller' | null;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  credits?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  register: (email: string, password: string, name: string, role?: UserRole) => Promise<boolean>;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
  register: async () => false,
});

// Clean up auth state to prevent issues
const cleanupAuthState = () => {
  // Remove standard auth tokens
  localStorage.removeItem('supabase.auth.token');
  // Remove all Supabase auth keys from localStorage
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      localStorage.removeItem(key);
    }
  });
  // Remove from sessionStorage if in use
  Object.keys(sessionStorage || {}).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      sessionStorage.removeItem(key);
    }
  });
};

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch user profile data
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('Fetching user profile for ID:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }

      if (data) {
        console.log('User profile data:', data);
        setUser({
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          credits: data.credits
        });
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  };

  // Check for user session on mount
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      if (event === 'SIGNED_IN' && session?.user) {
        // Defer data fetching to prevent deadlocks
        setTimeout(() => {
          fetchUserProfile(session.user.id);
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    // THEN check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('Existing session found:', session.user.id);
          await fetchUserProfile(session.user.id);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing auth:', error);
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Cleanup subscription when component unmounts
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const register = async (email: string, password: string, name: string, role: UserRole = 'reseller'): Promise<boolean> => {
    try {
      // Clean up existing state
      cleanupAuthState();
      
      // Try global sign out first
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Continue even if this fails
        console.error('Error during global sign out:', err);
      }
      
      console.log('Registering with email:', email, 'role:', role);
      
      // Step 1: Sign up with email/password with metadata
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role
          },
        },
      });
      
      if (error) {
        console.error('Registration error:', error);
        toast.error(error.message);
        return false;
      }

      if (!data.user) {
        console.error('No user returned from signUp');
        toast.error('Registration failed');
        return false;
      }

      console.log('SignUp successful, user ID:', data.user.id);
      
      // Step 2: Manually ensure the profile exists with correct data
      // This is a fallback in case the database trigger doesn't work
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          name: name,
          email: email,
          role: role,
          credits: role === 'reseller' ? 0 : null
        }, {
          onConflict: 'id'
        });
        
      if (profileError) {
        console.error('Error creating profile:', profileError);
        toast.error('Profile creation failed: ' + profileError.message);
        return false;
      }
      
      toast.success(`Account created successfully!`);
      return true;
    } catch (error) {
      console.error('Registration error:', error);
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
        // Continue even if this fails
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
        // User data will be set by the auth state change event
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

  const logout = async () => {
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

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      logout, 
      isAuthenticated: !!user,
      register
    }}>
      {children}
    </AuthContext.Provider>
  );
};
