
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

  // Simplified auth initialization
  useEffect(() => {
    let mounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing auth system...');
        
        // Set up auth state listener
        authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('🔄 Auth state changed:', event, session?.user?.id || 'no user');
          
          if (!mounted) return;
          
          if (session?.user) {
            console.log('✅ User session found, fetching profile');
            // Defer profile fetching to prevent conflicts
            setTimeout(() => {
              if (mounted) {
                fetchUserProfile(session.user.id).catch(error => {
                  console.error('❌ Error fetching user profile:', error);
                });
              }
            }, 100);
          } else {
            console.log('👋 No user session');
            setUser(null);
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
        
        if (mounted) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        if (mounted) {
          setIsLoading(false);
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
  }, [fetchUserProfile, setUser]);

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
