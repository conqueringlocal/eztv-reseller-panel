
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthContextType, User } from './types';
import { useUserProfile } from './hooks/useUserProfile';
import { useAuthOperations } from './hooks/useAuthOperations';
import { cleanupAuthState, forceAuthReset } from './utils';

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
  const [authError, setAuthError] = useState<string | null>(null);
  const { user, setUser, fetchUserProfile } = useUserProfile();
  const { signup, login, logout: logoutOperation } = useAuthOperations();

  // Check for user session on mount with enhanced error handling
  useEffect(() => {
    let mounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing auth system...');
        
        // Set up auth state listener FIRST
        authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('🔄 Auth state changed:', event, session?.user?.id || 'no user');
          
          if (!mounted) return;
          
          // Clear any previous auth errors
          setAuthError(null);
          
          if (session?.user) {
            // Validate the session before using it
            try {
              // Test the session by making a simple request
              const { error: testError } = await supabase.auth.getUser();
              
              if (testError) {
                console.error('❌ Session validation failed:', testError);
                // Session is corrupted, clean up and retry
                await forceAuthReset();
                setUser(null);
                return;
              }
              
              console.log('✅ Session validated, fetching user profile');
              // Defer data fetching to prevent deadlocks
              setTimeout(() => {
                if (mounted) {
                  fetchUserProfile(session.user.id).catch(error => {
                    console.error('❌ Error fetching user profile:', error);
                    setAuthError('Failed to load user profile');
                  });
                }
              }, 0);
            } catch (error) {
              console.error('❌ Session validation error:', error);
              await forceAuthReset();
              setUser(null);
            }
          } else if (event === 'SIGNED_OUT') {
            console.log('👋 User signed out');
            setUser(null);
            setAuthError(null);
          } else if (event === 'TOKEN_REFRESHED') {
            console.log('🔄 Token refreshed successfully');
          }
        });

        // THEN check for existing session
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('❌ Error getting initial session:', error);
            // If there's an error getting the session, clean up corrupted state
            await forceAuthReset();
          } else if (session?.user) {
            console.log('✅ Existing session found:', session.user.id);
            // The onAuthStateChange will handle this session
          } else {
            console.log('ℹ️ No existing session found');
          }
        } catch (error) {
          console.error('❌ Critical error checking session:', error);
          await forceAuthReset();
        }
        
        if (mounted) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        setAuthError('Failed to initialize authentication');
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Cleanup function
    return () => {
      mounted = false;
      if (authSubscription?.data?.subscription) {
        authSubscription.data.subscription.unsubscribe();
      }
    };
  }, [fetchUserProfile, setUser]);

  const logout = async () => {
    try {
      console.log('👋 Logging out user');
      await logoutOperation(setUser);
      setAuthError(null);
    } catch (error) {
      console.error('❌ Logout error:', error);
      setAuthError('Error during logout');
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      logout, 
      signup,
      isAuthenticated: !!user && !authError,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
