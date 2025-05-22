
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

// Helper to ensure user_role type exists
const ensureUserRoleType = async () => {
  try {
    console.log('Ensuring user_role type exists via edge function...');
    
    const SUPABASE_URL = "https://hddnqgggjjlildufirof.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZG5xZ2dnampsaWxkdWZpcm9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MDAzMzQsImV4cCI6MjA2MzM3NjMzNH0.ZvsGyn-c_FqwTg6fSLO8C7pWJcyW4Ev2jWoURq_H_Ho";
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-role-type`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    const result = await response.json();
    console.log('Edge function response:', result);
    
    if (result.error) {
      console.error('Error from edge function:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Error calling edge function:', error);
    // Continue anyway - it might still work
    return { error: error };
  }
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
      
      // Call edge function to ensure user_role type exists
      await ensureUserRoleType();
      
      // Create a direct INSERT into profiles first to avoid DB trigger issues
      try {
        const { error: directProfileError } = await supabase
          .from('profiles')
          .insert({
            id: 'placeholder', // Will be updated by the on_auth_user_created trigger
            name: name,
            email: email,
            role: role
          });

        if (directProfileError) {
          console.log('Profile pre-creation failed (expected):', directProfileError.message);
          // This is expected to fail due to the placeholder ID, but might help initialize the role type
        }
      } catch (err) {
        // Continue even if this fails
        console.error('Error during profile pre-creation:', err);
      }

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
      
      // Manually create the user profile as a fallback
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          name: name,
          email: email,
          role: role,
          credits: 0
        });

      if (profileError) {
        console.error('Manual profile creation error:', profileError);
        
        // Try upsert as a fallback
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            name: name,
            email: email,
            role: role,
            credits: 0
          });
          
        if (upsertError) {
          console.error('Profile upsert error:', upsertError);
          toast.error("Account created but profile setup failed");
          // Continue anyway - we will try to fix this on login
        }
      } else {
        console.log('Manual profile creation successful');
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
      
      // Ensure user_role exists (in case this is a demo login)
      if (email === 'admin@demo.com') {
        await ensureUserRoleType();
      }
      
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
