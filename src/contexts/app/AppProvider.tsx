
import React, { createContext, useState, useContext, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppContextType } from './types';
import { useCustomers } from './hooks/useCustomers';
import { useResellers } from './hooks/useResellers';
import { useCreditLogs } from './hooks/useCreditLogs';
import { useCredits } from './hooks/useCredits';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useApp = () => useAppContext();

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataInitialized, setDataInitialized] = useState(false);

  // Custom hooks for different data types
  const {
    customers,
    setCustomers,
    fetchCustomers,
    addCustomer,
    cancelCustomer,
    deactivateCustomer,
    reactivateCustomer,
    updateCustomer,
  } = useCustomers(user, authLoading);

  const {
    resellers,
    setResellers,
    fetchResellers,
    getReseller,
  } = useResellers(user, authLoading);

  const {
    creditLogs,
    setCreditLogs,
    fetchCreditLogs,
  } = useCreditLogs(user, authLoading);

  // Update session when auth changes
  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Error getting session in AppContext:', error);
          setSession(null);
          return;
        }
        
        setSession(session);
      } catch (error) {
        console.error('💥 Critical error getting session:', error);
        setSession(null);
      }
    };
    
    if (user) {
      getSession();
    } else {
      setSession(null);
    }
  }, [user]);

  // Only initialize data once when user becomes available
  useEffect(() => {
    if (user && !authLoading && !dataInitialized) {
      console.log('🔄 Initializing data for user:', user.id);
      setIsLoading(true);
      setDataInitialized(true);
      
      Promise.all([
        fetchCustomers(),
        fetchResellers(),
        fetchCreditLogs()
      ]).finally(() => {
        setIsLoading(false);
      });
    } else if (!user && !authLoading) {
      console.log('👤 No user, clearing data and reset initialization');
      setCustomers([]);
      setResellers([]);
      setCreditLogs([]);
      setDataInitialized(false);
    }
  }, [user, authLoading, dataInitialized, fetchCustomers, fetchResellers, fetchCreditLogs]);

  const refreshData = async () => {
    if (!user || authLoading) {
      console.warn('⚠️ Cannot refresh data: no user available or auth loading');
      return;
    }
    
    console.log('🔄 Refreshing all data');
    setIsLoading(true);
    await Promise.all([fetchCustomers(), fetchResellers(), fetchCreditLogs()]);
    setIsLoading(false);
  };

  // Credit management hooks
  const { addCredits, removeCredits } = useCredits(resellers, setResellers, refreshData);

  const value: AppContextType = {
    session,
    customers,
    resellers,
    creditLogs,
    isLoading,
    fetchCustomers,
    addCustomer,
    cancelCustomer,
    deactivateCustomer,
    reactivateCustomer,
    updateCustomer,
    refreshData,
    getReseller,
    addCredits,
    removeCredits,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
