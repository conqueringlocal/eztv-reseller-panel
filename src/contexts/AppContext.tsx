import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
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
  status: 'active' | 'cancelled' | 'expired' | 'expiring_soon';
  customerGroupId?: string;
  connectionNumber?: number;
  totalConnections?: number;
  isDeactivated: boolean;
  cancelledAt?: string;
  packageId?: string;
  connections?: number;
  accountType?: 'm3u' | 'mag'; // New field to distinguish account types
  highlevelContactId?: string; // Added HighLevel contact ID
}

interface Reseller extends Tables<'profiles'> {
  role: 'reseller';
}

interface AppContextType {
  customers: Customer[];
  resellers: Reseller[];
  loading: boolean;
  
  // Customer management
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => Promise<boolean>;
  updateCustomer: (customer: Customer) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  renewCustomer: (customerId: string, additionalMonths: number) => Promise<boolean>;
  
  // Reseller management
  addReseller: (reseller: Omit<Reseller, 'id' | 'created_at' | 'updated_at'>) => Promise<boolean>;
  updateResellerCredits: (resellerId: string, newCredits: number) => Promise<boolean>;
  
  // Data refresh
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);

  // Load data when user changes or on mount
  useEffect(() => {
    if (user) {
      refreshData();
    } else {
      console.log('Not authenticated, skipping data refresh');
      setLoading(false);
    }
  }, [user]);

  const refreshData = async () => {
    if (!user) {
      console.log('No user found, skipping data refresh');
      return;
    }

    try {
      setLoading(true);
      console.log('Refreshing data for user:', user.id, 'role:', user.role);

      // Load customers
      let customersQuery = supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by reseller if not admin
      if (user.role !== 'admin') {
        customersQuery = customersQuery.eq('reseller_id', user.id);
      }

      const { data: customersData, error: customersError } = await customersQuery;
      
      if (customersError) {
        console.error('Error loading customers:', customersError);
        toast.error('Failed to load customers');
      } else {
        const transformedCustomers = customersData.map(customer => ({
          id: customer.id,
          resellerId: customer.reseller_id,
          name: customer.name,
          email: customer.email,
          macAddress: customer.mac_address,
          deviceType: customer.device_type,
          planDuration: customer.plan_duration,
          startDate: customer.start_date,
          expirationDate: customer.expiration_date,
          createdAt: customer.created_at,
          username: customer.username,
          password: customer.password,
          customerGroupId: customer.customer_group_id,
          connectionNumber: customer.connection_number,
          totalConnections: customer.total_connections,
          isDeactivated: customer.is_deactivated,
          cancelledAt: customer.cancelled_at,
          status: customer.status as 'active' | 'cancelled' | 'expired' | 'expiring_soon',
          highlevelContactId: customer.highlevel_contact_id // Added HighLevel contact ID mapping
        }));
        setCustomers(transformedCustomers);
      }

      // Load resellers (admin only)
      if (user.role === 'admin') {
        const { data: resellersData, error: resellersError } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'reseller')
          .order('created_at', { ascending: false });
        
        if (resellersError) {
          console.error('Error loading resellers:', resellersError);
          toast.error('Failed to load resellers');
        } else {
          setResellers(resellersData as Reseller[]);
        }
      }
    } catch (error) {
      console.error('Error in refreshData:', error);
    } finally {
      setLoading(false);
    }
  };

  const addCustomer = async (customer: Omit<Customer, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
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
          customer_group_id: customer.customerGroupId,
          connection_number: customer.connectionNumber,
          total_connections: customer.totalConnections,
          highlevel_contact_id: customer.highlevelContactId
        });

      if (error) {
        console.error('Error adding customer:', error);
        toast.error('Failed to add customer');
        return false;
      }

      await refreshData();
      toast.success('Customer added successfully');
      return true;
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('Failed to add customer');
      return false;
    }
  };

  const updateCustomer = async (customer: Customer): Promise<boolean> => {
    try {
      console.log('Updating customer:', customer.id, customer);
      
      const { error } = await supabase
        .from('customers')
        .update({
          name: customer.name,
          email: customer.email,
          mac_address: customer.macAddress,
          device_type: customer.deviceType,
          plan_duration: customer.planDuration,
          start_date: customer.startDate,
          expiration_date: customer.expirationDate,
          username: customer.username,
          password: customer.password,
          customer_group_id: customer.customerGroupId,
          connection_number: customer.connectionNumber,
          total_connections: customer.totalConnections,
          is_deactivated: customer.isDeactivated,
          status: customer.status,
          highlevel_contact_id: customer.highlevelContactId
        })
        .eq('id', customer.id);

      if (error) {
        console.error('Error updating customer:', error);
        toast.error('Failed to update customer');
        return false;
      }

      await refreshData();
      return true;
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('Failed to update customer');
      return false;
    }
  };

  const cancelCustomer = async (customerId: string): Promise<boolean> => {
    console.log(`🚫 AppContext: Cancel request initiated for customer ID: ${customerId}`);
    
    try {
      // First, call the delete-iptv-user edge function to delete from panel
      console.log(`🔄 AppContext: Calling delete-iptv-user function for customer ${customerId}`);
      
      const { data, error } = await supabase.functions.invoke('delete-iptv-user', {
        body: { customerId }
      });
      
      if (error) {
        console.error(`❌ AppContext: Error calling delete-iptv-user function:`, error);
        toast.error('Failed to delete user from IPTV panel');
        return false;
      }
      
      if (!data?.success) {
        console.error(`❌ AppContext: delete-iptv-user function returned failure:`, data);
        toast.error(data?.message || 'Failed to delete user from IPTV panel');
        return false;
      }
      
      console.log(`✅ AppContext: Successfully deleted user from IPTV panel:`, data);
      
      // Update customer status to cancelled
      console.log(`🔄 AppContext: Updating customer status to cancelled for ID: ${customerId}`);
      
      const { error: updateError } = await supabase
        .from('customers')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', customerId);

      if (updateError) {
        console.error(`❌ AppContext: Error updating customer status:`, updateError);
        toast.error('Failed to update customer status');
        return false;
      }

      console.log(`✅ AppContext: Customer ${customerId} status updated to cancelled`);
      
      // Refresh data to show updated status
      await refreshData();
      console.log(`📊 AppContext: Data refreshed after customer cancellation`);
      
      toast.success('Customer account cancelled successfully');
      return true;
    } catch (error) {
      console.error(`💥 AppContext: Unexpected error during customer cancellation:`, error);
      toast.error('An error occurred while cancelling the customer account');
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
        return false;
      }

      await refreshData();
      return true;
    } catch (error) {
      console.error('Error deactivating customer:', error);
      return false;
    }
  };

  const renewCustomer = async (customerId: string, additionalMonths: number): Promise<boolean> => {
    try {
      // First, call the renew-iptv-user edge function
      const { data, error } = await supabase.functions.invoke('renew-iptv-user', {
        body: {
          customerId,
          additionalMonths
        }
      });

      if (error || !data?.success) {
        console.error('Error renewing customer in IPTV panel:', error || data);
        toast.error('Failed to renew customer in IPTV panel');
        return false;
      }

      // Get current customer data
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('expiration_date, reseller_id')
        .eq('id', customerId)
        .single();

      if (customerError || !customerData) {
        console.error('Error getting customer data:', customerError);
        toast.error('Failed to get customer data');
        return false;
      }

      // Calculate new expiration date
      const currentExpiry = new Date(customerData.expiration_date);
      const newExpiry = new Date(currentExpiry);
      newExpiry.setMonth(newExpiry.getMonth() + additionalMonths);

      // Update customer record
      const { error: updateError } = await supabase
        .from('customers')
        .update({ 
          expiration_date: newExpiry.toISOString().split('T')[0],
          is_deactivated: false, // Reactivate if deactivated
          status: 'active' // Set status back to active
        })
        .eq('id', customerId);

      if (updateError) {
        console.error('Error updating customer:', updateError);
        toast.error('Failed to update customer record');
        return false;
      }

      // Deduct credits from reseller
      const { data: resellerData, error: resellerError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', customerData.reseller_id)
        .single();

      if (resellerError || !resellerData) {
        console.error('Error getting reseller data:', resellerError);
        toast.error('Failed to get reseller data');
        return false;
      }

      if (resellerData.credits < additionalMonths) {
        toast.error('Insufficient credits for renewal');
        return false;
      }

      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: resellerData.credits - additionalMonths })
        .eq('id', customerData.reseller_id);

      if (creditError) {
        console.error('Error deducting credits:', creditError);
        toast.error('Failed to deduct credits');
        return false;
      }

      // Log the transaction
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: customerData.reseller_id,
          action: 'renewal',
          credits_used: additionalMonths,
          customer_id: customerId,
          notes: `${additionalMonths} month renewal`
        });

      if (logError) {
        console.error('Failed to log renewal transaction:', logError);
      }

      await refreshData();
      toast.success('Customer renewed successfully');
      return true;
    } catch (error) {
      console.error('Error renewing customer:', error);
      toast.error('Failed to renew customer');
      return false;
    }
  };

  const addReseller = async (reseller: Omit<Reseller, 'id' | 'created_at' | 'updated_at'>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('profiles')
        .insert(reseller);

      if (error) {
        console.error('Error adding reseller:', error);
        toast.error('Failed to add reseller');
        return false;
      }

      await refreshData();
      toast.success('Reseller added successfully');
      return true;
    } catch (error) {
      console.error('Error adding reseller:', error);
      toast.error('Failed to add reseller');
      return false;
    }
  };

  const updateResellerCredits = async (resellerId: string, newCredits: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', resellerId);

      if (error) {
        console.error('Error updating reseller credits:', error);
        toast.error('Failed to update reseller credits');
        return false;
      }

      await refreshData();
      toast.success('Reseller credits updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating reseller credits:', error);
      toast.error('Failed to update reseller credits');
      return false;
    }
  };

  const value: AppContextType = {
    customers,
    resellers,
    loading,
    addCustomer,
    updateCustomer,
    cancelCustomer,
    deactivateCustomer,
    renewCustomer,
    addReseller,
    updateResellerCredits,
    refreshData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
