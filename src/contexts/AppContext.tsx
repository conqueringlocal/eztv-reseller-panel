import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface Customer {
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
  maxConnections?: number;
  m3uUrl?: string;
  isTrial?: boolean;
  startDate?: string;
}

export interface Reseller {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  credits: number;
  stripeCustomerId?: string;
  logoUrl?: string;
  accentColor?: string;
  provider?: string;
}

export interface CreditLog {
  id: string;
  createdAt: string;
  date: string;
  resellerId: string;
  action: 'account_creation' | 'addition' | 'deduction';
  creditsUsed: number;
  customerName?: string;
  customerId?: string;
  notes?: string;
}

interface AppContextType {
  customers: Customer[];
  resellers: Reseller[];
  creditLogs: CreditLog[];
  isLoading?: boolean;
  createCustomer: (customerData: any) => Promise<boolean>;
  addCustomer?: (customerData: any) => Promise<boolean>;
  updateCustomer?: (customerId: string, customerData: any) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  refreshData: () => Promise<void>;
  bulkImportCustomers: (csvData: string, skipHeader: boolean) => Promise<{ success: boolean; results: any[] }>;
  createTrialCustomer: (customerData: any) => Promise<boolean>;
  addCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  getReseller?: (resellerId: string) => Reseller | undefined;
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
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const fetchData = async () => {
    try {
      if (!user) {
        console.log('Not fetching data - no user logged in');
        return;
      }

      setIsLoading(true);
      console.log('Fetching data...');

      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*');

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        toast.error('Failed to load customers');
      } else {
        // Transform database response to match Customer interface
        const transformedCustomers: Customer[] = (customersData || []).map(customer => ({
          id: customer.id,
          createdAt: customer.created_at,
          name: customer.name,
          email: customer.email,
          macAddress: customer.mac_address,
          username: customer.username,
          password: customer.password,
          expirationDate: customer.expiration_date,
          status: (customer.status || 'active') as 'active' | 'expired' | 'cancelled' | 'pending',
          resellerId: customer.reseller_id,
          deviceType: customer.device_type,
          planDuration: customer.plan_duration,
          isDeactivated: customer.is_deactivated || false,
          cancelledAt: customer.cancelled_at,
          highlevelContactId: customer.highlevel_contact_id,
          customerGroup: customer.customer_group,
          connectionSequence: customer.connection_sequence,
          maxConnections: customer.max_connections,
          m3uUrl: customer.m3u_url,
          isTrial: customer.is_trial,
          startDate: customer.start_date
        }));
        setCustomers(transformedCustomers);
        console.log(`Fetched ${transformedCustomers.length} customers`);
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
        // Transform database response to match Reseller interface
        const transformedResellers: Reseller[] = (resellersData || []).map(reseller => ({
          id: reseller.id,
          createdAt: reseller.created_at,
          name: reseller.name,
          email: reseller.email,
          credits: reseller.credits,
          logoUrl: undefined, // This field doesn't exist in database yet
          accentColor: undefined, // This field doesn't exist in database yet
          provider: reseller.provider
        }));
        setResellers(transformedResellers);
        console.log(`Fetched ${transformedResellers.length} resellers`);
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
        // Transform database response to match CreditLog interface
        const transformedCreditLogs: CreditLog[] = (creditLogsData || []).map(log => ({
          id: log.id,
          createdAt: log.date,
          date: log.date,
          resellerId: log.reseller_id,
          action: log.action,
          creditsUsed: log.credits_used,
          customerName: log.customer_name,
          customerId: log.customer_id,
          notes: log.notes
        }));
        setCreditLogs(transformedCreditLogs);
        console.log(`Fetched ${transformedCreditLogs.length} credit logs`);
      }

      console.log('Data fetching complete');

    } catch (error) {
      console.error('Unexpected error during data fetching:', error);
      toast.error('An unexpected error occurred while loading data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const createCustomer = async (customerData: any) => {
    try {
      console.log('Creating customer:', customerData);

      let functionName = 'create-customer'; // Default function
      let requestBody = { ...customerData, resellerId: user?.id };

      // Determine which function to call based on account type and provider
      if (customerData.accountType === 'mag') {
        functionName = 'create-mag-user';
        requestBody = {
          resellerId: user?.id,
          customerData: customerData
        };
      } else if (customerData.accountType === 'm3u') {
        // Check provider for M3U accounts - use reseller's provider
        const provider = user?.provider || '8k';
        console.log(`Using provider: ${provider} for M3U account creation`);
        
        if (provider === 'trex') {
          functionName = 'create-trex-user';
          requestBody = {
            resellerId: user?.id,
            customerData: customerData
          };
        } else {
          // Default to 8k provider
          functionName = 'create-iptv-user';
          requestBody = {
            resellerId: user?.id,
            customerData: customerData
          };
        }
      }

      console.log(`Calling function: ${functionName}`);
      console.log('Request body:', requestBody);

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: requestBody,
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

      // Handle multi-connection response
      if (data.customers && Array.isArray(data.customers)) {
        const totalCreated = data.customers.length;
        const totalFailed = data.failedConnections?.length || 0;
        const totalRequested = data.summary?.totalRequested || 0;
        const provider = data.provider || user?.provider || 'Unknown';

        if (totalCreated > 0) {
          toast.success(`Successfully created ${totalCreated} of ${totalRequested} ${provider.toUpperCase()} accounts${totalFailed > 0 ? ` (${totalFailed} failed)` : ''}!`);
          
          // Show detailed success message for multi-connection accounts
          if (totalCreated > 1) {
            console.log(`Multi-connection ${provider} accounts created:`, {
              customerGroup: data.summary?.customerGroup,
              accounts: data.customers.map(c => ({
                name: c.name,
                username: c.credentials?.username || c.mac_address,
                connectionNumber: c.connection_sequence
              }))
            });
          }
        } else {
          toast.error(`Failed to create any ${provider.toUpperCase()} accounts. ${totalFailed} connections failed.`);
          return false;
        }
      } else {
        // Single account creation (legacy response)
        const provider = data.provider || user?.provider || 'Unknown';
        toast.success(`${provider.toUpperCase()} customer created successfully!`);
      }

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
        console.log(`AppContext: No customer found with ID ${customerId} for this reseller`);
        toast.error('No customer found with that ID');
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
          action: 'addition',
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
          action: 'deduction',
          credits_used: credits,
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

  const getReseller = (resellerId: string): Reseller | undefined => {
    return resellers.find(r => r.id === resellerId);
  };

  const addCustomer = createCustomer; // Alias for backwards compatibility

  const updateCustomer = async (customerId: string, customerData: any): Promise<boolean> => {
    try {
      console.log(`Updating customer ${customerId}:`, customerData);

      const { error } = await supabase
        .from('customers')
        .update({
          name: customerData.name,
          email: customerData.email,
          mac_address: customerData.macAddress,
          device_type: customerData.deviceType,
        })
        .eq('id', customerId)
        .eq('reseller_id', user?.id);

      if (error) {
        console.error('Error updating customer:', error);
        toast.error('Failed to update customer');
        return false;
      }

      toast.success('Customer updated successfully');
      await fetchData();
      return true;
    } catch (error) {
      console.error('Unexpected error during customer update:', error);
      toast.error('An unexpected error occurred while updating the customer');
      return false;
    }
  };

  const contextValue: AppContextType = {
    customers,
    resellers,
    creditLogs,
    isLoading,
    createCustomer,
    addCustomer,
    updateCustomer,
    cancelCustomer,
    deactivateCustomer,
    refreshData,
    bulkImportCustomers,
    createTrialCustomer,
    addCredits,
    removeCredits,
    getReseller,
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
