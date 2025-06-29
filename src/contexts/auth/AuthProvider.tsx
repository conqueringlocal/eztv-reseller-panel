
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthContextType, User } from './types';
import { useUserProfile } from './hooks/useUserProfile';
import { useAuthOperations } from './hooks/useAuthOperations';

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
  signup: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const useUser = () => {
  const { user, isLoading } = useContext(AuthContext);
  return { user, isLoading, session: user ? { user } : null };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { user, setUser, fetchUserProfile } = useUserProfile();
  const { signup, login, logout: logoutOperation } = useAuthOperations();

  // Check for user session on mount
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (session?.user) {
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
  }, [fetchUserProfile, setUser]);

  const logout = () => {
    logoutOperation(setUser);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      logout, 
      signup,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
