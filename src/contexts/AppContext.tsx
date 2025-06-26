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
}

interface AppContextType {
  session: Session | null;
  customers: Customer[];
  fetchCustomers: () => Promise<void>;
  addCustomer: (customerData: Omit<Customer, 'id' | 'createdAt'>) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  reactivateCustomer: (customerId: string) => Promise<boolean>;
  updateCustomer: (customerId: string, updates: Partial<Customer>) => Promise<boolean>;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useUser();
  const [customers, setCustomers] = useState<Customer[]>([]);

  const fetchCustomers = async () => {
    try {
      if (!user) {
        console.warn('User not available, skipping fetchCustomers');
        return;
      }
      
      // Fetch customers for the specific reseller
      console.log(`Fetching customers for reseller ID: ${user.id}`);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('reseller_id', user.id)
        .order('createdAt', { ascending: false });

      if (error) {
        console.error('Error fetching customers:', error);
        toast.error('Failed to load customer data');
      } else {
        console.log(`Successfully fetched ${data.length} customers`);
        setCustomers(data);
      }
    } catch (error) {
      console.error('Unexpected error fetching customers:', error);
      toast.error('An unexpected error occurred while loading customers');
    }
  };

  useEffect(() => {
    if (user) {
      fetchCustomers();
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
            connections: customerData.connections,
            maxConnections: customerData.maxConnections,
            startDate: customerData.startDate,
            expirationDate: customerData.expirationDate,
            accountType: customerData.accountType,
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
        .update({ status: 'cancelled', cancelledAt: new Date().toISOString() })
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

  const refreshData = async () => {
    await fetchCustomers();
  };

  const value: AppContextType = {
    session,
    customers,
    fetchCustomers,
    addCustomer,
    cancelCustomer,
    deactivateCustomer,
    reactivateCustomer,
    updateCustomer,
    refreshData,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
