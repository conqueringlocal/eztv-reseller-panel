import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from 'react';
import { AuthContext } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export interface Customer {
  id: string;
  resellerId: string;
  name: string;
  email: string;
  macAddress: string;
  deviceType: string;
  planDuration: number;
  startDate: string;
  expirationDate: string;
  createdAt: string;
  username?: string;
  password?: string;
  m3uUrl?: string;
  customerGroupId?: string;
  connectionNumber?: number;
  totalConnections?: number;
  isDeactivated?: boolean;
  cancelledAt?: string;
  status?: 'active' | 'cancelled' | 'expired' | 'expiring_soon';
}

interface Reseller extends Tables<'profiles'> {}

interface SystemSetting extends Tables<'system_settings'> {}

interface CreditLog extends Tables<'credit_logs'> {}

interface AppContextType {
  customers: Customer[];
  resellers: Reseller[];
  systemSettings: SystemSetting[];
  creditLogs: CreditLog[];
  refreshData: () => Promise<void>;
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => Promise<boolean>;
  updateCustomer: (customer: Customer) => Promise<boolean>;
  deleteCustomer: (customerId: string) => Promise<boolean>;
  renewCustomer: (customer: Customer, planDuration: number) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  addResellerCredits: (resellerId: string, credits: number) => Promise<boolean>;
  deductResellerCredits: (resellerId: string, credits: number) => Promise<boolean>;
  updateSystemSetting: (id: string, value: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: React.ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);

  const refreshData = useCallback(async () => {
    if (!user) {
      console.log('Not authenticated, skipping data refresh');
      return;
    }

    try {
      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        toast.error('Failed to load customers');
      } else {
        setCustomers(customersData || []);
      }

      // Fetch resellers
      const { data: resellersData, error: resellersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'reseller' as Enums<'user_role'>);

      if (resellersError) {
        console.error('Error fetching resellers:', resellersError);
        toast.error('Failed to load resellers');
      } else {
        setResellers(resellersData || []);
      }

      // Fetch system settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('system_settings')
        .select('*');

      if (settingsError) {
        console.error('Error fetching system settings:', settingsError);
        toast.error('Failed to load system settings');
      } else {
        setSystemSettings(settingsData || []);
      }
      
      // Fetch credit logs
      const { data: creditLogsData, error: creditLogsError } = await supabase
        .from('credit_logs')
        .select('*')
        .order('date', { ascending: false });

      if (creditLogsError) {
        console.error('Error fetching credit logs:', creditLogsError);
        toast.error('Failed to load credit logs');
      } else {
        setCreditLogs(creditLogsData || []);
      }

    } catch (error) {
      console.error('Unexpected error during data refresh:', error);
      toast.error('An unexpected error occurred while refreshing data');
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addCustomer = async (customer: Omit<Customer, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([customer])
        .select()
        .single();

      if (error) {
        console.error('Error adding customer:', error);
        toast.error('Failed to add customer');
        return false;
      }

      toast.success('Customer added successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error adding customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const updateCustomer = async (customer: Customer): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(customer)
        .eq('id', customer.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating customer:', error);
        toast.error('Failed to update customer');
        return false;
      }

      toast.success('Customer updated successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error updating customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const deleteCustomer = async (customerId: string): Promise<boolean> => {
    console.log(`🗑️ AppContext: Deleting customer account: ${customerId}`);
    
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);

      if (error) {
        console.error('❌ AppContext: Error deleting customer:', error);
        toast.error('Failed to delete customer');
        return false;
      }

      console.log(`✅ AppContext: Customer ${customerId} deleted successfully`);
      toast.success('Customer deleted successfully');
      
      await refreshData();
      return true;
    } catch (error) {
      console.error('💥 AppContext: Unexpected error deleting customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const renewCustomer = async (customer: Customer, planDuration: number): Promise<boolean> => {
    try {
      // Calculate new expiration date
      const currentExpiration = new Date(customer.expirationDate);
      currentExpiration.setMonth(currentExpiration.getMonth() + planDuration);
      const newExpirationDate = currentExpiration.toISOString().split('T')[0];

      // Update customer record with new expiration date
      const { error } = await supabase
        .from('customers')
        .update({ 
          expiration_date: newExpirationDate,
          plan_duration: planDuration // Optionally update plan duration as well
        })
        .eq('id', customer.id);

      if (error) {
        console.error('Error renewing customer:', error);
        toast.error('Failed to renew customer');
        return false;
      }

      toast.success('Customer renewed successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error renewing customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const deactivateCustomer = async (customerId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_deactivated: true })
        .eq('id', customerId);

      if (error) {
        console.error('Error deactivating customer:', error);
        toast.error('Failed to deactivate customer');
        return false;
      }

      toast.success('Customer deactivated successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error deactivating customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const cancelCustomer = async (customerId: string): Promise<boolean> => {
    console.log(`🚫 AppContext: Cancelling customer account: ${customerId}`);
    
    try {
      // Update customer status to cancelled and set cancelled_at timestamp
      const { error } = await supabase
        .from('customers')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', customerId);

      if (error) {
        console.error('❌ AppContext: Error cancelling customer:', error);
        toast.error('Failed to cancel customer account');
        return false;
      }

      console.log(`✅ AppContext: Customer ${customerId} account cancelled successfully`);
      toast.success('Customer account cancelled successfully');
      
      // Refresh data to update the UI
      await refreshData();
      return true;
    } catch (error) {
      console.error('💥 AppContext: Unexpected error cancelling customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const addResellerCredits = async (resellerId: string, credits: number): Promise<boolean> => {
    try {
      // Fetch current credits
      const { data: currentReseller, error: fetchError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();

      if (fetchError) {
        console.error('Error fetching reseller credits:', fetchError);
        toast.error('Failed to fetch reseller credits');
        return false;
      }

      const currentCredits = currentReseller?.credits || 0;

      // Update credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: currentCredits + credits })
        .eq('id', resellerId);

      if (updateError) {
        console.error('Error adding credits:', updateError);
        toast.error('Failed to add credits');
        return false;
      }

      toast.success('Credits added successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error adding credits:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const deductResellerCredits = async (resellerId: string, credits: number): Promise<boolean> => {
    try {
      // Fetch current credits
      const { data: currentReseller, error: fetchError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();

      if (fetchError) {
        console.error('Error fetching reseller credits:', fetchError);
        toast.error('Failed to fetch reseller credits');
        return false;
      }

      const currentCredits = currentReseller?.credits || 0;

      // Check if enough credits are available
      if (currentCredits < credits) {
        toast.error('Insufficient credits');
        return false;
      }

      // Update credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: currentCredits - credits })
        .eq('id', resellerId);

      if (updateError) {
        console.error('Error deducting credits:', updateError);
        toast.error('Failed to deduct credits');
        return false;
      }

      toast.success('Credits deducted successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error deducting credits:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const updateSystemSetting = async (id: string, value: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value })
        .eq('id', id);

      if (error) {
        console.error('Error updating system setting:', error);
        toast.error('Failed to update system setting');
        return false;
      }

      toast.success('System setting updated successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error updating system setting:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const value = {
    customers,
    resellers,
    systemSettings,
    creditLogs,
    refreshData,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    renewCustomer,
    deactivateCustomer,
    cancelCustomer,
    addResellerCredits,
    deductResellerCredits,
    updateSystemSetting,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
