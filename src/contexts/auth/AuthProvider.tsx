
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const { user, setUser, fetchUserProfile } = useUserProfile();
  const { signup, login, logout: logoutOperation } = useAuthOperations();

  // Stable callback for fetching user profile
  const stableFetchUserProfile = useCallback(async (userId: string) => {
    try {
      await fetchUserProfile(userId);
    } catch (error) {
      console.error('❌ Error fetching user profile:', error);
    }
  }, [fetchUserProfile]);

  // Initialize auth system
  useEffect(() => {
    let mounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing auth system...');
        
        // Set up auth state listener first
        authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('🔄 Auth state changed:', event, session?.user?.id || 'no user');
          
          if (!mounted) return;
          
          if (session?.user) {
            console.log('✅ User session found, fetching profile');
            // Use setTimeout to prevent potential deadlocks
            setTimeout(() => {
              if (mounted) {
                stableFetchUserProfile(session.user.id);
              }
            }, 0);
          } else {
            console.log('👋 No user session, clearing user state');
            setUser(null);
          }
          
          // Set loading to false after handling auth state change
          if (mounted && !isInitialized) {
            setIsLoading(false);
            setIsInitialized(true);
          }
        });

        // Check for existing session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Error getting initial session:', error);
        } else if (session?.user) {
          console.log('✅ Existing session found:', session.user.id);
        } else {
          console.log('ℹ️ No existing session found');
        }
        
        // Set loading to false if no session exists
        if (mounted && !session) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        if (mounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      if (authSubscription?.data?.subscription) {
        authSubscription.data.subscription.unsubscribe();
      }
    };
  }, [stableFetchUserProfile]);

  const logout = async () => {
    try {
      console.log('👋 Logging out user');
      await logoutOperation(setUser);
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
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
