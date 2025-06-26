
import React, { createContext, useState, useContext, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { useUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Customer {
  id: string;
  createdAt: string;
  resellerId: string;
  name: string;
  email: string;
  username: string;
  password?: string;
  macAddress?: string | null;
  deviceType: string;
  packageId: string;
  planDuration: number;
  maxConnections: number;
  currentConnections: number;
  connectionDetails: any[];
  startDate: string;
  expirationDate: string;
  status: string;
  isDeactivated: boolean;
  provider: string;
  customer_group?: string;
  customer_group_id?: string | null;
  m3u_url?: string | null;
  connection_sequence?: number | null;
  cancelledAt?: string | null;
  highlevelContactId?: string | null;
  // Add missing properties for compatibility
  customerGroup?: string;
  connectionSequence?: number | null;
  m3uUrl?: string | null;
  isTrial?: boolean;
}

export interface CreditLog {
  id: string;
  reseller_id: string;
  date: string;
  action: string;
  credits_used: number;
  customer_id?: string;
  connections_used?: number;
  notes?: string;
  customer_name?: string;
}

export interface Reseller {
  id: string;
  name: string;
  email: string;
  credits: number;
  provider?: string;
  logoUrl?: string;
  accentColor?: string;
}

interface AppContextType {
  session: Session | null;
  customers: Customer[];
  resellers: Reseller[];
  creditLogs: CreditLog[];
  isLoading: boolean;
  fetchCustomers: () => Promise<void>;
  addCustomer: (customerData: Omit<Customer, 'id' | 'createdAt'>) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  reactivateCustomer: (customerId: string) => Promise<boolean>;
  updateCustomer: (customerId: string, updates: Partial<Customer>) => Promise<boolean>;
  refreshData: () => Promise<void>;
  getReseller: (resellerId: string) => Reseller | undefined;
  addCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useApp = () => useAppContext();

// Helper function to convert database customer to interface Customer
const convertDbCustomerToCustomer = (dbCustomer: any): Customer => {
  return {
    id: dbCustomer.id,
    createdAt: dbCustomer.created_at,
    resellerId: dbCustomer.reseller_id,
    name: dbCustomer.name,
    email: dbCustomer.email,
    username: dbCustomer.username || '',
    password: dbCustomer.password,
    macAddress: dbCustomer.mac_address,
    deviceType: dbCustomer.device_type,
    packageId: dbCustomer.customer_group_id || 'default',
    planDuration: dbCustomer.plan_duration,
    maxConnections: dbCustomer.max_connections || 1,
    currentConnections: dbCustomer.current_connections || 0,
    connectionDetails: dbCustomer.connection_details || [],
    startDate: dbCustomer.start_date,
    expirationDate: dbCustomer.expiration_date,
    status: dbCustomer.status,
    isDeactivated: dbCustomer.is_deactivated || false,
    provider: dbCustomer.provider || '8k',
    customer_group: dbCustomer.customer_group,
    customer_group_id: dbCustomer.customer_group_id,
    m3u_url: dbCustomer.m3u_url,
    connection_sequence: dbCustomer.connection_sequence,
    cancelledAt: dbCustomer.cancelled_at,
    highlevelContactId: dbCustomer.highlevel_contact_id,
    // Add compatibility properties
    customerGroup: dbCustomer.customer_group,
    connectionSequence: dbCustomer.connection_sequence,
    m3uUrl: dbCustomer.m3u_url,
    isTrial: dbCustomer.is_trial || false,
  };
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useUser();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCustomers = async () => {
    try {
      if (!user) {
        console.warn('User not available, skipping fetchCustomers');
        return;
      }
      
      setIsLoading(true);
      // Fetch customers for the specific reseller
      console.log(`Fetching customers for reseller ID: ${user.id}`);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('reseller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching customers:', error);
        toast.error('Failed to load customer data');
      } else {
        console.log(`Successfully fetched ${data.length} customers`);
        const convertedCustomers = data.map(convertDbCustomerToCustomer);
        setCustomers(convertedCustomers);
      }
    } catch (error) {
      console.error('Unexpected error fetching customers:', error);
      toast.error('An unexpected error occurred while loading customers');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchResellers = async () => {
    try {
      if (!user || user.role !== 'admin') return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'reseller')
        .order('name');

      if (error) {
        console.error('Error fetching resellers:', error);
      } else {
        setResellers(data || []);
      }
    } catch (error) {
      console.error('Error fetching resellers:', error);
    }
  };

  const fetchCreditLogs = async () => {
    try {
      if (!user) return;
      
      let query = supabase
        .from('credit_logs')
        .select('*')
        .order('date', { ascending: false });

      // If user is not admin, filter by their reseller_id
      if (user.role !== 'admin') {
        query = query.eq('reseller_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching credit logs:', error);
      } else {
        setCreditLogs(data || []);
      }
    } catch (error) {
      console.error('Error fetching credit logs:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchCustomers();
      fetchResellers();
      fetchCreditLogs();
    }
  }, [user]);

  const addCustomer = async (customerData: Omit<Customer, 'id' | 'createdAt'>) => {
    console.log(`🚀 AppContext: Adding customer with provider-specific routing`);
    console.log(`📋 Customer data:`, customerData);
    
    try {
      // Get the user's assigned provider
      const userProvider = user?.provider || '8k';
      console.log(`🏢 User provider: ${userProvider}`);
      
      // Use provider-specific edge function
      let functionName: string;
      
      switch (userProvider) {
        case 'trex':
          functionName = 'create-trex-user';
          break;
        case '8k':
          functionName = 'create-8k-user';
          break;
        default:
          // Fallback to generic function for unknown providers
          functionName = 'create-iptv-user';
      }
      
      console.log(`📞 Calling edge function: ${functionName}`);
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          resellerId: customerData.resellerId,
          customerData: {
            name: customerData.name,
            email: customerData.email,
            macAddress: customerData.macAddress,
            deviceType: customerData.deviceType,
            packageId: customerData.packageId,
            planDuration: customerData.planDuration,
            connections: customerData.maxConnections,
            maxConnections: customerData.maxConnections,
            startDate: customerData.startDate,
            expirationDate: customerData.expirationDate,
            status: customerData.status,
            isDeactivated: customerData.isDeactivated,
          }
        }
      });

      if (error) {
        console.error(`❌ Error calling ${functionName}:`, error);
        toast.error(`Failed to create ${userProvider.toUpperCase()} customer: ${error.message}`);
        return false;
      }

      if (!data.success) {
        console.error(`❌ ${functionName} returned failure:`, data.error);
        toast.error(data.error || `Failed to create ${userProvider.toUpperCase()} customer`);
        return false;
      }

      console.log(`✅ ${functionName} success:`, data);
      
      // Show success message with provider information
      const totalCreated = data.customers?.length || 1;
      const providerName = userProvider.toUpperCase();
      
      if (totalCreated > 1) {
        toast.success(`${providerName} customer created successfully with ${totalCreated} connections!`);
      } else {
        toast.success(`${providerName} customer created successfully!`);
      }

      // Refresh data to show new customer
      await refreshData();
      return true;

    } catch (error) {
      console.error('💥 Unexpected error in addCustomer:', error);
      toast.error('An error occurred while creating the customer');
      return false;
    }
  };

  const cancelCustomer = async (customerId: string) => {
    console.log(`🚫 AppContext: Attempting to cancel customer ID: ${customerId}`);
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', customerId)
        .select()
        .single();
  
      if (error) {
        console.error(`❌ AppContext: Error cancelling customer ${customerId}:`, error);
        toast.error('Failed to cancel customer account');
        return false;
      }
  
      console.log(`✅ AppContext: Customer ${customerId} cancelled successfully`);
      setCustomers(customers.map(c => c.id === customerId ? { ...c, status: 'cancelled', cancelledAt: new Date().toISOString() } : c));
      toast.success('Customer cancelled successfully');
      return true;
    } catch (error) {
      console.error('💥 AppContext: Unexpected error during customer cancellation:', error);
      toast.error('An error occurred while cancelling the customer account');
      return false;
    }
  };

  const deactivateCustomer = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ is_deactivated: true })
        .eq('id', customerId)
        .select()
        .single();

      if (error) {
        console.error('Error deactivating customer:', error);
        toast.error('Failed to deactivate customer');
        return false;
      }

      setCustomers(customers.map(c => c.id === customerId ? { ...c, isDeactivated: true } : c));
      return true;
    } catch (error) {
      console.error('Error deactivating customer:', error);
      toast.error('An error occurred while deactivating the customer');
      return false;
    }
  };

  const reactivateCustomer = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ is_deactivated: false })
        .eq('id', customerId)
        .select()
        .single();

      if (error) {
        console.error('Error reactivating customer:', error);
        toast.error('Failed to reactivate customer');
        return false;
      }

      setCustomers(customers.map(c => c.id === customerId ? { ...c, isDeactivated: false } : c));
      toast.success('Customer reactivated successfully');
      return true;
    } catch (error) {
      console.error('Error reactivating customer:', error);
      toast.error('An error occurred while reactivating the customer');
      return false;
    }
  };

  const updateCustomer = async (customerId: string, updates: Partial<Customer>) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', customerId)
        .select()
        .single();

      if (error) {
        console.error('Error updating customer:', error);
        toast.error('Failed to update customer');
        return false;
      }

      setCustomers(customers.map(c => c.id === customerId ? { ...c, ...updates } : c));
      toast.success('Customer updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('An error occurred while updating the customer');
      return false;
    }
  };

  const getReseller = (resellerId: string) => {
    return resellers.find(r => r.id === resellerId);
  };

  const addCredits = async (resellerId: string, credits: number, notes?: string) => {
    try {
      // Use RPC function instead of supabase.sql
      const { data, error } = await supabase.rpc('increment_user_credits', {
        user_id: resellerId,
        credit_amount: credits
      });

      if (error) {
        console.error('Error adding credits:', error);
        // Fallback to direct update
        const { data: updateData, error: updateError } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', resellerId)
          .single();

        if (updateError || !updateData) {
          toast.error('Failed to add credits');
          return false;
        }

        const newCredits = updateData.credits + credits;
        const { error: finalError } = await supabase
          .from('profiles')
          .update({ credits: newCredits })
          .eq('id', resellerId);

        if (finalError) {
          toast.error('Failed to add credits');
          return false;
        }
      }

      // Log the credit addition
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'addition',
          credits_used: credits,
          notes: notes || 'Manual credit addition'
        });

      if (logError) {
        console.error('Error logging credit addition:', logError);
      }

      // Update local state
      setResellers(resellers.map(r => r.id === resellerId ? { ...r, credits: r.credits + credits } : r));
      await refreshData();
      return true;
    } catch (error) {
      console.error('Error adding credits:', error);
      return false;
    }
  };

  const removeCredits = async (resellerId: string, credits: number, notes?: string) => {
    try {
      const reseller = getReseller(resellerId);
      if (!reseller || reseller.credits < credits) {
        return false;
      }

      // Use direct update instead of supabase.sql
      const newCredits = reseller.credits - credits;
      const { data, error } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', resellerId)
        .select()
        .single();

      if (error) {
        console.error('Error removing credits:', error);
        toast.error('Failed to remove credits');
        return false;
      }

      // Log the credit removal
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'deduction',
          credits_used: credits,
          notes: notes || 'Manual credit removal'
        });

      if (logError) {
        console.error('Error logging credit removal:', logError);
      }

      // Update local state
      setResellers(resellers.map(r => r.id === resellerId ? { ...r, credits: r.credits - credits } : r));
      await refreshData();
      return true;
    } catch (error) {
      console.error('Error removing credits:', error);
      return false;
    }
  };

  const refreshData = async () => {
    await Promise.all([fetchCustomers(), fetchResellers(), fetchCreditLogs()]);
  };

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
