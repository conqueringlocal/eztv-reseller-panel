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
  macAddress?: string; // Made optional since it's not required anymore
  deviceType: string;
  planDuration: number;
  startDate: string;
  expirationDate: string;
  createdAt: string;
  connectionNumber?: number;
  totalConnections?: number;
  customerGroupId?: string;
  status?: 'active' | 'expiring_soon' | 'expired';
  isDeactivated?: boolean;
  username?: string;
  password?: string;
  m3uUrl?: string; // Add M3U URL field
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
  logoUrl?: string;
  accentColor?: string;
}

interface AddCustomerData {
  resellerId: string;
  name: string;
  email: string;
  macAddress?: string; // Made optional
  deviceType: string;
  planDuration: number;
  connections: number;
}

interface AppContextType {
  customers: Customer[];
  creditLogs: CreditLog[];
  resellers: Reseller[];
  addCustomer: (customer: AddCustomerData) => Promise<boolean>;
  updateCustomer: (customer: Customer) => Promise<boolean>;
  deleteCustomer: (customerId: string) => Promise<boolean>;
  renewCustomer: (customerId: string, planDuration: number) => Promise<boolean>;
  addCredits: (resellerId: string, amount: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, amount: number, notes?: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  updateResellerBranding: (resellerId: string, logoUrl?: string, accentColor?: string) => Promise<boolean>;
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
  deactivateCustomer: async () => false,
  updateResellerBranding: async () => false,
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
  const mapCustomer = (dbCustomer: any): Customer => {
    // Calculate status based on expiration date
    const today = new Date();
    const expiryDate = new Date(dbCustomer.expiration_date);
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);
    
    let status: 'active' | 'expiring_soon' | 'expired';
    if (expiryDate < today) {
      status = 'expired';
    } else if (expiryDate <= threeDaysFromNow) {
      status = 'expiring_soon';
    } else {
      status = 'active';
    }
    
    return {
      id: dbCustomer.id,
      resellerId: dbCustomer.reseller_id,
      name: dbCustomer.name,
      email: dbCustomer.email,
      macAddress: dbCustomer.mac_address || '', // Handle nullable MAC address
      deviceType: dbCustomer.device_type,
      planDuration: dbCustomer.plan_duration,
      startDate: dbCustomer.start_date,
      expirationDate: dbCustomer.expiration_date,
      createdAt: dbCustomer.created_at,
      connectionNumber: dbCustomer.connection_number || 1,
      totalConnections: dbCustomer.total_connections || 1,
      customerGroupId: dbCustomer.customer_group_id,
      status,
      isDeactivated: dbCustomer.is_deactivated || false,
      username: dbCustomer.username,
      password: dbCustomer.password,
      m3uUrl: dbCustomer.m3u_url, // Add M3U URL field
    };
  };

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
    logoUrl: dbReseller.logo_url,
    accentColor: dbReseller.accent_color,
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
        const { data: resellerData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        const { data: customersData } = await supabase
          .from('customers')
          .select('*')
          .eq('reseller_id', user.id);

        const { data: logsData } = await supabase
          .from('credit_logs')
          .select('*')
          .eq('reseller_id', user.id)
          .order('date', { ascending: false });

        setResellers(resellerData ? [mapReseller(resellerData)] : []);
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
  
  // Helper for generating usernames based on customer name and connection number
  const generateCustomerUsername = (name: string, connectionNumber: number): string => {
    // Remove spaces, special chars and convert to lowercase
    const baseName = name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
      .substring(0, 10);
      
    return `${baseName}${connectionNumber}`;
  };
  
  // Helper for generating random passwords
  const generateCustomerPassword = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let password = "";
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };
  
  // Create customer connection with M3U account
  const createCustomerConnection = async (
    customerData: AddCustomerData,
    customerGroupId: string,
    connectionNumber: number,
    totalConnections: number
  ): Promise<string | null> => {
    console.log(`Creating M3U customer connection ${connectionNumber} for ${customerData.name}`);
    
    // Generate dates
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + customerData.planDuration);
    const expirationDate = expiryDate.toISOString().split('T')[0];
    
    // Generate credentials
    const username = generateCustomerUsername(customerData.name, connectionNumber);
    const password = generateCustomerPassword();
    
    console.log(`Generated credentials for M3U account: ${username} / ${password}`);
    
    // Initialize variables to store actual credentials and M3U URL
    let actualUsername = username;
    let actualPassword = password;
    let m3uUrl = '';
    
    // Create M3U IPTV user using edge function
    try {
      console.log('Calling create-iptv-user edge function for M3U account...');
      const { data, error } = await supabase.functions.invoke('create-iptv-user', {
        body: {
          userParams: {
            username,
            password,
            maxConnections: 1,
            expiryDate: expiryDate.toISOString(),
            isTrial: false,
            bouquet: "1", // Default package ID for M3U
            output: "ts" // Specify TS format
          }
        }
      });
      
      console.log('M3U Edge function response:', { data, error });
      
      if (error) {
        console.error(`Edge function error for M3U connection ${connectionNumber}:`, error);
        toast.error(`Failed to create M3U IPTV account for connection ${connectionNumber}: ${error.message}`);
        return null;
      }
      
      if (!data?.success) {
        console.error(`M3U IPTV API error for connection ${connectionNumber}:`, data);
        const errorMessage = data?.error || data?.details || 'Unknown error';
        
        toast.error(`Failed to create M3U IPTV account for connection ${connectionNumber}: ${errorMessage}`);
        
        // Log more details for debugging
        console.error('Full M3U API error response:', data);
        
        // If it's a 403 error, show specific guidance
        if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
          toast.error('M3U API access forbidden. Please check the API key configuration.');
        }
        
        return null;
      }
      
      console.log(`Successfully created M3U IPTV user: ${username}`);
      console.log('M3U API returned user data:', data.user);
      
      // Store the actual credentials returned by the IPTV panel
      actualUsername = data.user?.username || username;
      actualPassword = data.user?.password || password;
      m3uUrl = data.user?.m3uUrl || data.m3uUrl || '';
      
      // Show success with actual credentials
      toast.success(`M3U Connection ${connectionNumber} created! User: ${actualUsername}, Pass: ${actualPassword}`);
      
    } catch (error) {
      console.error('Error calling M3U edge function:', error);
      toast.error(`Error creating M3U IPTV account: ${error}`);
      return null;
    }
    
    // Insert customer record in database with the actual credentials and M3U URL
    const { data: newCustomer, error: customerError } = await supabase
      .from('customers')
      .insert({
        reseller_id: customerData.resellerId,
        name: customerData.name,
        email: customerData.email,
        device_type: customerData.deviceType,
        plan_duration: customerData.planDuration,
        start_date: startDate,
        expiration_date: expirationDate,
        username: actualUsername,
        password: actualPassword,
        m3u_url: m3uUrl,
        customer_group_id: customerGroupId,
        connection_number: connectionNumber,
        total_connections: totalConnections,
      })
      .select()
      .single();
    
    if (customerError) {
      console.error(`Failed to create M3U customer connection ${connectionNumber}:`, customerError);
      toast.error(`Failed to save M3U customer connection ${connectionNumber}: ${customerError.message}`);
      return null;
    }
    
    console.log(`Successfully created M3U customer record: ${newCustomer.id}`);
    return newCustomer.id;
  };

  // Add new customer with multiple connections
  const addCustomer = async (customerData: AddCustomerData): Promise<boolean> => {
    if (!user) {
      console.error('No user found');
      toast.error('You must be logged in to add customers');
      return false;
    }
    
    console.log('Starting customer creation process:', customerData);
    
    try {
      // Check if reseller has enough credits
      const { data: reseller, error: resellerError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', customerData.resellerId)
        .single();
      
      if (resellerError || !reseller) {
        console.error('Reseller error:', resellerError);
        toast.error('Reseller not found');
        return false;
      }
      
      console.log(`Reseller has ${reseller.credits} credits`);
      
      // Calculate total credits needed (connections * plan duration)
      const totalCreditsNeeded = customerData.connections * customerData.planDuration;
      console.log(`Total credits needed: ${totalCreditsNeeded}`);
      
      if (reseller.credits < totalCreditsNeeded) {
        console.error(`Insufficient credits: has ${reseller.credits}, needs ${totalCreditsNeeded}`);
        toast.error(`Insufficient credits. You need ${totalCreditsNeeded} credits but have ${reseller.credits}.`);
        return false;
      }
      
      // Generate a customer group ID
      const customerGroupId = `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      console.log(`Generated customer group ID: ${customerGroupId}`);
      
      // Create multiple connections
      const customerIds: string[] = [];
      for (let i = 1; i <= customerData.connections; i++) {
        console.log(`Creating connection ${i} of ${customerData.connections}`);
        const customerId = await createCustomerConnection(
          customerData,
          customerGroupId,
          i,
          customerData.connections
        );
        
        if (customerId) {
          customerIds.push(customerId);
          console.log(`Successfully created connection ${i}`);
        } else {
          console.error(`Failed to create connection ${i}`);
          // Continue with other connections even if one fails
        }
      }
      
      if (customerIds.length === 0) {
        console.error('Failed to create any customer connections');
        toast.error('Failed to create any customer connections');
        return false;
      }
      
      console.log(`Created ${customerIds.length} out of ${customerData.connections} connections`);
      
      // Update reseller credits only if we created at least some connections
      const actualCreditsUsed = customerIds.length * customerData.planDuration;
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: reseller.credits - actualCreditsUsed })
        .eq('id', customerData.resellerId);
      
      if (creditError) {
        console.error('Credit update error:', creditError);
        toast.error(`Failed to update credits: ${creditError.message}`);
        return false;
      }
      
      console.log(`Successfully deducted ${actualCreditsUsed} credits`);
      
      // Log the transaction
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: customerData.resellerId,
          action: 'account_creation',
          credits_used: actualCreditsUsed,
          customer_id: customerIds[0],  // Reference first connection
          customer_name: customerData.name,
          notes: `${customerData.planDuration} month subscription with ${customerIds.length} connections created`
        });
      
      if (logError) {
        console.error(`Failed to log transaction: ${logError.message}`);
      }
      
      // Refresh data
      await refreshData();
      
      if (customerIds.length === customerData.connections) {
        toast.success(`Customer added successfully with ${customerData.connections} connections`);
      } else {
        toast.success(`Customer partially added with ${customerIds.length} out of ${customerData.connections} connections`);
      }
      
      return true;
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('An unexpected error occurred while adding customer');
      return false;
    }
  };

  // Update an existing customer
  const updateCustomer = async (updatedCustomer: Customer): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Update the customer in supabase - mac_address is optional
      const { error } = await supabase
        .from('customers')
        .update({
          name: updatedCustomer.name,
          email: updatedCustomer.email,
          mac_address: updatedCustomer.macAddress || null, // Can be null
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

  // Deactivate a customer
  const deactivateCustomer = async (customerId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Get the customer to deactivate
      const customer = customers.find(c => c.id === customerId);
      if (!customer) {
        toast.error('Customer not found');
        return false;
      }

      // In a real implementation, this would call the IPTV API to deactivate the account
      console.log(`[DEMO] Calling IPTV API to deactivate account for user: ${customer.username}`);
      
      // Before we update the customer status in supabase, let's run a query to check if the is_deactivated column exists
      console.log('Checking if is_deactivated column exists in customers table');
      
      // For now, we'll update our approach to handle this error:
      // Since the error is about 'is_deactivated' not existing in the type,
      // we'll use a dynamic object to update only fields we know exist
      const updateData: Record<string, boolean> = {};
      
      // Check if the column exists by attempting to read it first
      const { data: columnInfo, error: columnError } = await supabase
        .from('customers')
        .select('is_deactivated')
        .eq('id', customerId)
        .limit(1);
        
      if (columnInfo && 'is_deactivated' in (columnInfo[0] || {})) {
        // Column exists, we can use it
        updateData.is_deactivated = true;
      } else {
        // Column doesn't exist, log this information
        console.error('is_deactivated column not found in customers table');
        toast.error('Cannot deactivate customer - database schema mismatch');
        return false;
      }
      
      // Update the customer status in supabase using our dynamic object
      const { error } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', customerId);
      
      if (error) {
        toast.error(`Failed to update customer status: ${error.message}`);
        return false;
      }
      
      // Refresh data
      await refreshData();
      
      toast.success('Customer account deactivated successfully');
      return true;
    } catch (error) {
      console.error('Error deactivating customer:', error);
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
          expiration_date: expirationDate,
          is_deactivated: false // Re-activate if it was deactivated
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

  // Update reseller branding (logo and accent color)
  const updateResellerBranding = async (resellerId: string, logoUrl?: string, accentColor?: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Prepare update data
      const updateData: Record<string, string | undefined> = {};
      if (logoUrl) updateData.logo_url = logoUrl;
      if (accentColor) updateData.accent_color = accentColor;
      
      // Update reseller profile
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', resellerId);
      
      if (error) {
        toast.error(`Failed to update branding: ${error.message}`);
        return false;
      }
      
      // Refresh data
      await refreshData();
      
      toast.success('Branding updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating reseller branding:', error);
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
        deactivateCustomer,
        updateResellerBranding,
        isLoading,
        getReseller,
        refreshData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
