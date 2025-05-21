import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Types
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
}

export interface CreditLog {
  id: string;
  resellerId: string;
  date: string;
  action: 'deduction' | 'addition' | 'account_creation';
  creditsUsed: number;
  customerId?: string;
  customerName?: string;
  notes?: string;
}

export interface Reseller {
  id: string;
  name: string;
  email: string;
  credits: number;
}

interface AppContextType {
  customers: Customer[];
  creditLogs: CreditLog[];
  resellers: Reseller[];
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'startDate' | 'expirationDate'>) => Promise<boolean>;
  updateCustomer: (customer: Customer) => Promise<boolean>;
  deleteCustomer: (customerId: string) => Promise<boolean>;
  renewCustomer: (customerId: string, planDuration: number) => Promise<boolean>;
  addCredits: (resellerId: string, amount: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, amount: number, notes?: string) => Promise<boolean>;
  isLoading: boolean;
  getReseller: (id: string) => Reseller | undefined;
  refreshData: () => Promise<void>;
}

// Create the context
const AppContext = createContext<AppContextType>({
  customers: [],
  creditLogs: [],
  resellers: [],
  addCustomer: async () => false,
  updateCustomer: async () => false,
  deleteCustomer: async () => false,
  renewCustomer: async () => false,
  addCredits: async () => false,
  removeCredits: async () => false,
  isLoading: true,
  getReseller: () => undefined,
  refreshData: async () => {},
});

// Create the custom hook
export const useApp = () => useContext(AppContext);

// Create the provider
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Convert database objects to our frontend format
  const mapCustomer = (dbCustomer: any): Customer => ({
    id: dbCustomer.id,
    resellerId: dbCustomer.reseller_id,
    name: dbCustomer.name,
    email: dbCustomer.email,
    macAddress: dbCustomer.mac_address,
    deviceType: dbCustomer.device_type,
    planDuration: dbCustomer.plan_duration,
    startDate: dbCustomer.start_date,
    expirationDate: dbCustomer.expiration_date,
    createdAt: dbCustomer.created_at,
  });

  const mapCreditLog = (dbLog: any): CreditLog => ({
    id: dbLog.id,
    resellerId: dbLog.reseller_id,
    date: dbLog.date,
    action: dbLog.action,
    creditsUsed: dbLog.credits_used,
    customerId: dbLog.customer_id,
    customerName: dbLog.customer_name,
    notes: dbLog.notes,
  });

  const mapReseller = (dbReseller: any): Reseller => ({
    id: dbReseller.id,
    name: dbReseller.name,
    email: dbReseller.email,
    credits: dbReseller.credits,
  });

  // Fetch data based on user role
  const refreshData = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Fetch data based on user role
      if (user.role === 'admin') {
        // Admin can see all data
        const { data: resellersData } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'reseller');

        const { data: customersData } = await supabase
          .from('customers')
          .select('*');

        const { data: logsData } = await supabase
          .from('credit_logs')
          .select('*')
          .order('date', { ascending: false });

        setResellers(resellersData?.map(mapReseller) || []);
        setCustomers(customersData?.map(mapCustomer) || []);
        setCreditLogs(logsData?.map(mapCreditLog) || []);
      } else {
        // Resellers can only see their own data
        const { data: customersData } = await supabase
          .from('customers')
          .select('*')
          .eq('reseller_id', user.id);

        const { data: logsData } = await supabase
          .from('credit_logs')
          .select('*')
          .eq('reseller_id', user.id)
          .order('date', { ascending: false });

        setCustomers(customersData?.map(mapCustomer) || []);
        setCreditLogs(logsData?.map(mapCreditLog) || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      refreshData();
    } else {
      // Reset state when user logs out
      setCustomers([]);
      setCreditLogs([]);
      setResellers([]);
    }
  }, [user]);

  // Helper to get current timestamp
  const getCurrentISOString = () => new Date().toISOString();

  // Add new customer
  const addCustomer = async (
    customerData: Omit<Customer, 'id' | 'createdAt' | 'startDate' | 'expirationDate'>
  ): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Check if reseller has enough credits
      const { data: reseller, error: resellerError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', customerData.resellerId)
        .single();
      
      if (resellerError || !reseller) {
        toast.error('Reseller not found');
        return false;
      }
      
      if (reseller.credits < customerData.planDuration) {
        toast.error('Insufficient credits');
        return false;
      }
      
      // Generate IPTV credentials
      const username = Math.random().toString(36).substring(2, 10);
      const password = Math.random().toString(36).substring(2, 10);
      
      // Calculate dates
      const today = new Date();
      const startDate = today.toISOString().split('T')[0];
      
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + customerData.planDuration);
      const expirationDate = expiryDate.toISOString().split('T')[0];
      
      // Insert customer
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          reseller_id: customerData.resellerId,
          name: customerData.name,
          email: customerData.email,
          mac_address: customerData.macAddress,
          device_type: customerData.deviceType,
          plan_duration: customerData.planDuration,
          start_date: startDate,
          expiration_date: expirationDate,
          username: username,
          password: password
        })
        .select()
        .single();
      
      if (customerError) {
        toast.error(`Failed to create customer: ${customerError.message}`);
        return false;
      }
      
      // Update reseller credits
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: reseller.credits - customerData.planDuration })
        .eq('id', customerData.resellerId);
      
      if (creditError) {
        toast.error(`Failed to update credits: ${creditError.message}`);
        return false;
      }
      
      // Log the transaction
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: customerData.resellerId,
          action: 'account_creation',
          credits_used: customerData.planDuration,
          customer_id: newCustomer.id,
          customer_name: customerData.name,
          notes: `${customerData.planDuration} month subscription`
        });
      
      if (logError) {
        console.error(`Failed to log transaction: ${logError.message}`);
      }
      
      // Refresh data
      await refreshData();
      
      toast.success('Customer added successfully');
      return true;
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  // Update an existing customer
  const updateCustomer = async (updatedCustomer: Customer): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Update the customer in supabase
      const { error } = await supabase
        .from('customers')
        .update({
          name: updatedCustomer.name,
          email: updatedCustomer.email,
          mac_address: updatedCustomer.macAddress,
          device_type: updatedCustomer.deviceType
        })
        .eq('id', updatedCustomer.id);
      
      if (error) {
        toast.error(`Failed to update customer: ${error.message}`);
        return false;
      }
      
      // Refresh data
      await refreshData();
      return true;
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  // Delete customer
  const deleteCustomer = async (customerId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Delete the customer from supabase
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);
      
      if (error) {
        toast.error(`Failed to delete customer: ${error.message}`);
        return false;
      }
      
      // Refresh data
      await refreshData();
      return true;
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  // Renew a customer subscription
  const renewCustomer = async (customerId: string, planDuration: number): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Get the customer to renew
      const customer = customers.find(c => c.id === customerId);
      if (!customer) {
        toast.error('Customer not found');
        return false;
      }
      
      // Check if reseller has enough credits
      const { data: reseller, error: resellerError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', customer.resellerId)
        .single();
      
      if (resellerError || !reseller) {
        toast.error('Reseller not found');
        return false;
      }
      
      if (reseller.credits < planDuration) {
        toast.error('Insufficient credits');
        return false;
      }
      
      // Calculate new expiration date
      const expiryDate = new Date();
      // If the subscription is already expired, start from today
      // Otherwise, extend from the current expiration date
      const currentExpiryDate = new Date(customer.expirationDate);
      if (currentExpiryDate < new Date()) {
        expiryDate.setMonth(expiryDate.getMonth() + planDuration);
      } else {
        expiryDate.setTime(currentExpiryDate.getTime());
        expiryDate.setMonth(expiryDate.getMonth() + planDuration);
      }
      
      const expirationDate = expiryDate.toISOString().split('T')[0];
      
      // Update the customer in supabase
      const { error: updateError } = await supabase
        .from('customers')
        .update({
          expiration_date: expirationDate
        })
        .eq('id', customerId);
      
      if (updateError) {
        toast.error(`Failed to update customer: ${updateError.message}`);
        return false;
      }
      
      // Update reseller credits
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: reseller.credits - planDuration })
        .eq('id', customer.resellerId);
      
      if (creditError) {
        toast.error(`Failed to update credits: ${creditError.message}`);
        return false;
      }
      
      // Log the transaction
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: customer.resellerId,
          action: 'deduction',
          credits_used: planDuration,
          customer_id: customer.id,
          customer_name: customer.name,
          notes: `${planDuration} month subscription renewal`
        });
      
      if (logError) {
        console.error(`Failed to log transaction: ${logError.message}`);
      }
      
      // Refresh data
      await refreshData();
      
      return true;
    } catch (error) {
      console.error('Error renewing customer:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  // Add credits to a reseller
  const addCredits = async (resellerId: string, amount: number, notes?: string): Promise<boolean> => {
    if (!user || amount <= 0) return false;
    
    try {
      const { data: reseller, error: resellerError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();
      
      if (resellerError || !reseller) {
        toast.error('Reseller not found');
        return false;
      }
      
      // Update reseller credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: reseller.credits + amount })
        .eq('id', resellerId);
      
      if (updateError) {
        toast.error(`Failed to update credits: ${updateError.message}`);
        return false;
      }
      
      // Log the transaction
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'addition',
          credits_used: amount,
          notes: notes || 'Manual credit addition'
        });
      
      if (logError) {
        console.error(`Failed to log transaction: ${logError.message}`);
      }
      
      // Refresh data
      await refreshData();
      
      toast.success(`Added ${amount} credits successfully`);
      return true;
    } catch (error) {
      console.error('Error adding credits:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  // Remove credits from a reseller
  const removeCredits = async (resellerId: string, amount: number, notes?: string): Promise<boolean> => {
    if (!user || amount <= 0) return false;
    
    try {
      const { data: reseller, error: resellerError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();
      
      if (resellerError || !reseller) {
        toast.error('Reseller not found');
        return false;
      }
      
      if (reseller.credits < amount) {
        toast.error('Insufficient credits');
        return false;
      }
      
      // Update reseller credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: reseller.credits - amount })
        .eq('id', resellerId);
      
      if (updateError) {
        toast.error(`Failed to update credits: ${updateError.message}`);
        return false;
      }
      
      // Log the transaction
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'deduction',
          credits_used: amount,
          notes: notes || 'Manual credit deduction'
        });
      
      if (logError) {
        console.error(`Failed to log transaction: ${logError.message}`);
      }
      
      // Refresh data
      await refreshData();
      
      toast.success(`Removed ${amount} credits successfully`);
      return true;
    } catch (error) {
      console.error('Error removing credits:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  };

  // Get a reseller by ID
  const getReseller = (id: string): Reseller | undefined => {
    return resellers.find(r => r.id === id);
  };

  return (
    <AppContext.Provider
      value={{
        customers,
        creditLogs,
        resellers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        renewCustomer,
        addCredits,
        removeCredits,
        isLoading,
        getReseller,
        refreshData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
