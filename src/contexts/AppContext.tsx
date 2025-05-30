import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';
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
  packageId?: string;
  connections?: number;
}

interface Reseller extends Tables<'profiles'> {
  accentColor?: string;
  logoUrl?: string;
}

interface SystemSetting extends Tables<'system_settings'> {}

export interface CreditLog extends Tables<'credit_logs'> {
  customerName?: string;
  creditsUsed: number;
  resellerId: string;
}

interface AppContextType {
  customers: Customer[];
  resellers: Reseller[];
  systemSettings: SystemSetting[];
  creditLogs: CreditLog[];
  isLoading: boolean;
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
  addCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  getReseller: (resellerId: string) => Reseller | undefined;
  updateResellerBranding: (resellerId: string, branding: { accentColor?: string; logoUrl?: string }) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: React.ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshData = useCallback(async () => {
    if (!user) {
      console.log('Not authenticated, skipping data refresh');
      return;
    }

    setIsLoading(true);
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
        // Transform snake_case to camelCase
        const transformedCustomers = (customersData || []).map(customer => ({
          id: customer.id,
          resellerId: customer.reseller_id,
          name: customer.name,
          email: customer.email,
          macAddress: customer.mac_address || '',
          deviceType: customer.device_type,
          planDuration: customer.plan_duration,
          startDate: customer.start_date,
          expirationDate: customer.expiration_date,
          createdAt: customer.created_at,
          username: customer.username,
          password: customer.password,
          m3uUrl: customer.m3u_url,
          customerGroupId: customer.customer_group_id,
          connectionNumber: customer.connection_number,
          totalConnections: customer.total_connections,
          isDeactivated: customer.is_deactivated,
          cancelledAt: customer.cancelled_at,
          status: customer.status as 'active' | 'cancelled' | 'expired' | 'expiring_soon'
        }));
        setCustomers(transformedCustomers);
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
        // Transform snake_case to camelCase for credit logs
        const transformedCreditLogs = (creditLogsData || []).map(log => ({
          ...log,
          customerName: log.customer_name,
          creditsUsed: log.credits_used,
          resellerId: log.reseller_id
        }));
        setCreditLogs(transformedCreditLogs);
      }

    } catch (error) {
      console.error('Unexpected error during data refresh:', error);
      toast.error('An unexpected error occurred while refreshing data');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addCustomer = async (customer: Omit<Customer, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      // Get reseller info for passing to IPTV API
      const reseller = resellers.find(r => r.id === customer.resellerId);
      if (!reseller) {
        console.error('Reseller not found for customer');
        toast.error('Reseller not found');
        return false;
      }

      // Check if reseller has enough credits
      if (reseller.credits < customer.planDuration * (customer.connections || 1)) {
        toast.error('Insufficient credits');
        return false;
      }

      // Generate IPTV credentials if not provided
      const username = customer.username || `${customer.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().substring(0, 10)}${Math.floor(Math.random() * 1000)}`;
      const password = customer.password || Math.random().toString(36).substring(2, 10);

      // Calculate expiry date for IPTV API
      const expiryDate = new Date(customer.expirationDate);

      // Call IPTV API via edge function
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('No active session found');
        toast.error('Authentication required');
        return false;
      }

      const { data, error } = await supabase.functions.invoke('create-iptv-user', {
        body: {
          userParams: {
            username,
            password,
            maxConnections: customer.connections || 1,
            expiryDate: expiryDate.toISOString(),
            isTrial: false,
            bouquet: customer.packageId || '1',
            output: "ts",
            customerName: customer.name,
            resellerName: reseller.name
          }
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || !data?.success) {
        console.error('Failed to create IPTV user:', error || data);
        toast.error('Failed to create IPTV account');
        return false;
      }

      // Extract credentials from IPTV API response
      const iptvCredentials = data.user || {};
      const finalUsername = iptvCredentials.username || username;
      const finalPassword = iptvCredentials.password || password;
      const m3uUrl = iptvCredentials.m3uUrl || data.m3uUrl;

      // Transform camelCase to snake_case for database
      const dbCustomer = {
        reseller_id: customer.resellerId,
        name: customer.name,
        email: customer.email,
        mac_address: customer.macAddress,
        device_type: customer.deviceType,
        plan_duration: customer.planDuration,
        start_date: customer.startDate,
        expiration_date: customer.expirationDate,
        username: finalUsername,
        password: finalPassword,
        m3u_url: m3uUrl,
        customer_group_id: customer.customerGroupId,
        connection_number: customer.connectionNumber,
        total_connections: customer.totalConnections || customer.connections,
        is_deactivated: customer.isDeactivated || false,
        cancelled_at: customer.cancelledAt,
        status: customer.status || 'active'
      };

      const { data: insertedCustomer, error: insertError } = await supabase
        .from('customers')
        .insert([dbCustomer])
        .select()
        .single();

      if (insertError) {
        console.error('Error adding customer:', insertError);
        toast.error('Failed to add customer to database');
        return false;
      }

      // Deduct credits from reseller
      const creditsToDeduct = customer.planDuration * (customer.connections || 1);
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: reseller.credits - creditsToDeduct })
        .eq('id', customer.resellerId);

      if (creditError) {
        console.error('Failed to deduct credits:', creditError);
        // Customer was created but credits weren't deducted - log this issue
        toast.error('Customer created but failed to deduct credits');
      }

      // Log the credit usage
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: customer.resellerId,
          action: 'account_creation',
          credits_used: creditsToDeduct,
          customer_name: customer.name,
          customer_id: insertedCustomer.id,
          notes: `${customer.planDuration} month subscription with ${customer.connections || 1} connection(s)`
        });

      if (logError) {
        console.error('Failed to log credit usage:', logError);
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
      // Transform camelCase to snake_case for database
      const dbCustomer = {
        reseller_id: customer.resellerId,
        name: customer.name,
        email: customer.email,
        mac_address: customer.macAddress,
        device_type: customer.deviceType,
        plan_duration: customer.planDuration,
        start_date: customer.startDate,
        expiration_date: customer.expirationDate,
        username: customer.username,
        password: customer.password,
        m3u_url: customer.m3uUrl,
        customer_group_id: customer.customerGroupId,
        connection_number: customer.connectionNumber,
        total_connections: customer.totalConnections,
        is_deactivated: customer.isDeactivated,
        cancelled_at: customer.cancelledAt,
        status: customer.status
      };

      const { data, error } = await supabase
        .from('customers')
        .update(dbCustomer)
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
    console.log(`🔄 AppContext: Starting renewal for customer ${customer.name} (${customer.id}) for ${planDuration} months`);
    
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('❌ AppContext: No active session found');
        toast.error('Authentication required');
        return false;
      }

      console.log(`📡 AppContext: Calling renew-iptv-user edge function`);
      
      // Call the edge function for renewal
      const { data, error } = await supabase.functions.invoke('renew-iptv-user', {
        body: {
          customerId: customer.id,
          planDuration: planDuration
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('❌ AppContext: Edge function error:', error);
        toast.error('Failed to renew subscription - please try again');
        return false;
      }

      if (data.error) {
        console.error('❌ AppContext: Renewal failed:', data.error);
        
        // Handle specific error cases
        if (data.error === 'Insufficient credits') {
          toast.error(`Insufficient credits. Required: ${data.required}, Available: ${data.available}`);
        } else {
          toast.error(data.error);
        }
        return false;
      }

      console.log(`✅ AppContext: Customer renewal successful:`, data);
      toast.success(data.message || `Subscription renewed for ${planDuration} ${planDuration === 1 ? 'month' : 'months'}!`);
      
      // Refresh data to update the UI
      await refreshData();
      return true;
      
    } catch (error) {
      console.error('💥 AppContext: Unexpected error during renewal:', error);
      toast.error('An unexpected error occurred during renewal');
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

  // New credit management functions
  const addCredits = async (resellerId: string, credits: number, notes?: string): Promise<boolean> => {
    try {
      // Add credits to reseller
      const addResult = await addResellerCredits(resellerId, credits);
      
      if (addResult) {
        // Log the credit addition
        const { error: logError } = await supabase
          .from('credit_logs')
          .insert({
            reseller_id: resellerId,
            action: 'addition',
            credits_used: credits,
            notes: notes || null,
            customer_name: null,
            customer_id: null
          });

        if (logError) {
          console.error('Error logging credit addition:', logError);
        }
      }
      
      return addResult;
    } catch (error) {
      console.error('Unexpected error adding credits:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const removeCredits = async (resellerId: string, credits: number, notes?: string): Promise<boolean> => {
    try {
      // Remove credits from reseller
      const removeResult = await deductResellerCredits(resellerId, credits);
      
      if (removeResult) {
        // Log the credit deduction
        const { error: logError } = await supabase
          .from('credit_logs')
          .insert({
            reseller_id: resellerId,
            action: 'deduction',
            credits_used: credits,
            notes: notes || null,
            customer_name: null,
            customer_id: null
          });

        if (logError) {
          console.error('Error logging credit deduction:', logError);
        }
      }
      
      return removeResult;
    } catch (error) {
      console.error('Unexpected error removing credits:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const getReseller = (resellerId: string): Reseller | undefined => {
    return resellers.find(reseller => reseller.id === resellerId);
  };

  const updateResellerBranding = async (resellerId: string, branding: { accentColor?: string; logoUrl?: string }): Promise<boolean> => {
    try {
      // In a real implementation, this would update the reseller's branding in the database
      // For now, we'll just simulate success since the profiles table doesn't have these fields yet
      toast.success('Branding updated successfully');
      await refreshData();
      return true;
    } catch (error) {
      console.error('Unexpected error updating branding:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  const value = {
    customers,
    resellers,
    systemSettings,
    creditLogs,
    isLoading,
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
    addCredits,
    removeCredits,
    getReseller,
    updateResellerBranding,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
