import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AppContextType {
  customers: Customer[];
  resellers: Reseller[];
  creditLogs: CreditLog[];
  createCustomer: (customerData: any) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  refreshData: () => Promise<void>;
  bulkImportCustomers: (csvData: string, skipHeader: boolean) => Promise<{ success: boolean; results: any[] }>;
  createTrialCustomer: (customerData: any) => Promise<boolean>;
  addCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
}

interface Customer {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  macAddress?: string;
  username?: string;
  password?: string;
  expirationDate: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  resellerId: string;
  deviceType: string;
  planDuration: number;
  isDeactivated: boolean;
  cancelledAt: string | null;
  highlevelContactId?: string;
  customerGroup?: string;
  connectionSequence?: number;
}

interface Reseller {
  id: string;
  createdAt: string;
  email: string;
  credits: number;
  stripeCustomerId?: string;
}

interface CreditLog {
  id: string;
  createdAt: string;
  resellerId: string;
  action: 'account_creation' | 'credit_purchase' | 'account_renewal';
  creditsUsed: number;
  customerName?: string;
  customerId?: string;
  notes?: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const { user } = useAuth();

  const fetchData = async () => {
    try {
      if (!user) {
        console.log('Not fetching data - no user logged in');
        return;
      }

      console.log('Fetching data...');

      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*');

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        toast.error('Failed to load customers');
      } else {
        setCustomers(customersData || []);
        console.log(`Fetched ${customersData?.length || 0} customers`);
      }

      // Fetch resellers
      const { data: resellersData, error: resellersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'reseller');

      if (resellersError) {
        console.error('Error fetching resellers:', resellersError);
        toast.error('Failed to load resellers');
      } else {
        setResellers(resellersData || []);
        console.log(`Fetched ${resellersData?.length || 0} resellers`);
      }

      // Fetch credit logs
      const { data: creditLogsData, error: creditLogsError } = await supabase
        .from('credit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (creditLogsError) {
        console.error('Error fetching credit logs:', creditLogsError);
        toast.error('Failed to load credit logs');
      } else {
        setCreditLogs(creditLogsData || []);
        console.log(`Fetched ${creditLogsData?.length || 0} credit logs`);
      }

      console.log('Data fetching complete');

    } catch (error) {
      console.error('Unexpected error during data fetching:', error);
      toast.error('An unexpected error occurred while loading data');
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const createCustomer = async (customerData: any) => {
    try {
      console.log('Creating customer:', customerData);

      const { data, error } = await supabase.functions.invoke('create-customer', {
        body: { ...customerData, resellerId: user?.id },
      });

      if (error) {
        console.error('Function invoke error:', error);
        toast.error(error.message);
        return false;
      }

      if (data.error) {
        console.error('Customer creation error:', data.error);
        toast.error(data.error);
        return false;
      }

      toast.success('Customer created successfully!');
      await fetchData();
      return true;
    } catch (error) {
      console.error('Unexpected error during customer creation:', error);
      toast.error('An unexpected error occurred while creating the customer');
      return false;
    }
  };

  const cancelCustomer = async (customerId: string) => {
    try {
      console.log(`AppContext: Cancelling customer with ID: ${customerId}`);
      
      const { data, error } = await supabase
        .from('customers')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', customerId)
        .eq('reseller_id', user?.id);

      if (error) {
        console.error('Error cancelling customer:', error);
        toast.error('Failed to cancel customer account');
        return false;
      }

      if (data) {
        console.log(`AppContext: Customer ${customerId} cancelled successfully`);
        toast.success('Customer cancelled successfully');
        await fetchData();
        return true;
      } else {
        console.warn(`AppContext: No customer found with ID ${customerId} for this reseller`);
        toast.warn('No customer found with that ID');
        return false;
      }
    } catch (error) {
      console.error('Unexpected error during customer cancellation:', error);
      toast.error('An unexpected error occurred while cancelling the customer');
      return false;
    }
  };

  const deactivateCustomer = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ is_deactivated: true })
        .eq('id', customerId)
        .eq('reseller_id', user?.id);

      if (error) {
        console.error('Error deactivating customer:', error);
        toast.error('Failed to deactivate customer');
        return false;
      }

      await fetchData();
      return true;
    } catch (error) {
      console.error('Unexpected error during customer deactivation:', error);
      toast.error('An unexpected error occurred while deactivating the customer');
      return false;
    }
  };

  const refreshData = async () => {
    await fetchData();
  };

  const bulkImportCustomers = async (csvData: string, skipHeader: boolean) => {
    try {
      console.log('Starting bulk import of customers...');

      const { data, error } = await supabase.functions.invoke('bulk-import-customers', {
        body: { csvData, resellerId: user?.id, skipHeader },
      });

      if (error) {
        console.error('Function invoke error:', error);
        toast.error(error.message);
        return { success: false, results: [] };
      }

      if (data.error) {
        console.error('Bulk import error:', data.error);
        toast.error(data.error);
        return { success: false, results: [] };
      }

      toast.success('Bulk import completed!');
      await fetchData();
      return { success: true, results: data.results };
    } catch (error) {
      console.error('Unexpected error during bulk import:', error);
      toast.error('An unexpected error occurred during bulk import');
      return { success: false, results: [] };
    }
  };

  const createTrialCustomer = async (customerData: any) => {
    try {
      console.log('Creating trial customer:', customerData);

      const { data, error } = await supabase.functions.invoke('create-trial-customer', {
        body: { ...customerData, resellerId: user?.id },
      });

      if (error) {
        console.error('Function invoke error:', error);
        toast.error(error.message);
        return false;
      }

      if (data.error) {
        console.error('Trial customer creation error:', data.error);
        toast.error(data.error);
        return false;
      }

      toast.success('Trial customer created successfully!');
      await fetchData();
      return true;
    } catch (error) {
      console.error('Unexpected error during trial customer creation:', error);
      toast.error('An unexpected error occurred while creating the trial customer');
      return false;
    }
  };

  const addCredits = async (resellerId: string, credits: number, notes?: string) => {
    try {
      console.log(`Adding ${credits} credits to reseller ${resellerId}`);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();

      if (profileError) {
        console.error('Error fetching reseller profile:', profileError);
        toast.error('Failed to update credits - could not fetch reseller profile');
        return false;
      }

      const currentCredits = profileData?.credits || 0;
      const newCredits = currentCredits + credits;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', resellerId);

      if (updateError) {
        console.error('Error updating reseller credits:', updateError);
        toast.error('Failed to update credits');
        return false;
      }

      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'credit_purchase',
          credits_used: credits,
          notes: notes || `Credits added manually`,
        });

      if (logError) {
        console.error('Error logging credit usage:', logError);
        // Non-critical error, continue
      }

      toast.success(`Successfully added ${credits} credits`);
      await fetchData();
      return true;
    } catch (error) {
      console.error('Unexpected error during credit addition:', error);
      toast.error('An unexpected error occurred while adding credits');
      return false;
    }
  };

  const removeCredits = async (resellerId: string, credits: number, notes?: string) => {
    try {
      console.log(`Removing ${credits} credits from reseller ${resellerId}`);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();

      if (profileError) {
        console.error('Error fetching reseller profile:', profileError);
        toast.error('Failed to update credits - could not fetch reseller profile');
        return false;
      }

      const currentCredits = profileData?.credits || 0;
      const newCredits = Math.max(0, currentCredits - credits); // Prevent negative credits

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', resellerId);

      if (updateError) {
        console.error('Error updating reseller credits:', updateError);
        toast.error('Failed to update credits');
        return false;
      }

      // Log the credit removal
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'credit_purchase', // Using existing enum value for credit adjustments
          credits_used: -credits, // Use negative value to indicate removal
          notes: notes || `Credits removed manually`,
        });

      if (logError) {
        console.error('Error logging credit removal:', logError);
        // Non-critical error, continue
      }

      toast.success(`Successfully removed ${credits} credits`);
      await fetchData();
      return true;
    } catch (error) {
      console.error('Unexpected error during credit removal:', error);
      toast.error('An unexpected error occurred while removing credits');
      return false;
    }
  };

  const contextValue: AppContextType = {
    customers,
    resellers,
    creditLogs,
    createCustomer,
    cancelCustomer,
    deactivateCustomer,
    refreshData,
    bulkImportCustomers,
    createTrialCustomer,
    addCredits,
    removeCredits,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
