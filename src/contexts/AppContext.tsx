import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from 'react';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'reseller';
  credits: number;
  created_at?: string;
  parent_reseller_id?: string;
  reseller_level?: number;
  provider?: string;
  logoUrl?: string;
  accentColor?: string;
}

export interface CreditLog {
  id: string;
  resellerId: string;
  date: string;
  action: string;
  creditsUsed: number;
  customerName?: string;
  notes?: string;
  customerId?: string;
  connectionsUsed?: number;
}

export interface AppContextType {
  session: Session | null;
  user: Profile | null;
  resellers: Profile[];
  customers: Customer[];
  creditLogs: CreditLog[];
  loading: boolean;
  isLoading: boolean;
  refreshData: () => Promise<void>;
  addCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  addReseller: (email: string, name: string) => Promise<boolean>;
  getReseller: (resellerId: string) => Profile | undefined;
  addCustomer: (customerData: NewCustomerData) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  activateCustomer: (customerId: string) => Promise<boolean>;
  updateCustomer: (customerId: string, updates: Partial<Customer>) => Promise<boolean>;
  renewCustomer: (customerId: string, duration: number) => Promise<boolean>;
  createTrialAccount: (email: string) => Promise<boolean>;
  updateConnectionCount: (customerId: string, connectionChange: number) => Promise<boolean>;
  validateConnectionLimit: (customerId: string, newConnections: number) => Promise<boolean>;
}

export interface Customer {
  id: string;
  resellerId: string;
  name: string;
  email: string;
  username?: string;
  password?: string;
  macAddress?: string;
  deviceType: string;
  packageId?: string;
  planDuration: number;
  connections?: number;
  maxConnections?: number;
  currentConnections?: number;
  connectionDetails?: any[];
  startDate: string;
  expirationDate: string;
  status: string;
  isDeactivated: boolean;
  cancelledAt?: string;
  isTrialAccount?: boolean;
  isTrial?: boolean; // Add this for backward compatibility
  highlevelContactId?: string;
  provider?: string;
  connectionNumber?: number;
  customerGroupId?: string;
  m3uUrl?: string;
  createdAt?: string;
}

export interface NewCustomerData {
  resellerId: string;
  name: string;
  email: string;
  macAddress?: string;
  deviceType: string;
  packageId: string;
  planDuration: number;
  connections: number;
  maxConnections?: number;
  startDate: string;
  expirationDate: string;
  accountType: 'm3u' | 'mag';
  status: string;
  isDeactivated: boolean;
}

interface TrialResult {
  success: boolean;
  message: string;
  username?: string;
  password?: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [resellers, setResellers] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session?.user) {
        await fetchUser(session.user.id);
      } else {
        setLoading(false);
      }
    };

    fetchSession();

    supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUser(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });
  }, []);

  const fetchUser = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setUser(profile);
      await Promise.all([fetchResellers(), fetchCustomers(), fetchCreditLogs()]);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchResellers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'reseller');

      if (error) throw error;
      setResellers(data);
    } catch (error) {
      console.error('Error fetching resellers:', error);
      toast.error('Failed to load resellers');
    }
  };

  const fetchCreditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_logs')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      const formattedLogs: CreditLog[] = data.map(log => ({
        id: log.id,
        resellerId: log.reseller_id,
        date: log.date,
        action: log.action,
        creditsUsed: log.credits_used,
        customerName: log.customer_name || undefined,
        notes: log.notes || undefined,
        customerId: log.customer_id || undefined,
        connectionsUsed: log.connections_used || 1,
      }));

      setCreditLogs(formattedLogs);
    } catch (error) {
      console.error('Error fetching credit logs:', error);
      toast.error('Failed to load credit logs');
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          id,
          reseller_id,
          name,
          email,
          username,
          password,
          mac_address,
          device_type,
          plan_duration,
          max_connections,
          current_connections,
          connection_details,
          start_date,
          expiration_date,
          status,
          is_deactivated,
          cancelled_at,
          is_trial,
          highlevel_contact_id,
          provider,
          connection_number,
          customer_group_id,
          m3u_url,
          created_at
        `);

      if (error) throw error;

      const formattedCustomers: Customer[] = data.map(customer => ({
        id: customer.id,
        resellerId: customer.reseller_id,
        name: customer.name,
        email: customer.email,
        username: customer.username || undefined,
        password: customer.password || undefined,
        macAddress: customer.mac_address || undefined,
        deviceType: customer.device_type,
        planDuration: customer.plan_duration,
        connections: customer.max_connections || 1,
        maxConnections: customer.max_connections || 1,
        currentConnections: customer.current_connections || 0,
        connectionDetails: Array.isArray(customer.connection_details) ? customer.connection_details : [],
        startDate: customer.start_date,
        expirationDate: customer.expiration_date,
        status: customer.status || 'active',
        isDeactivated: customer.is_deactivated || false,
        cancelledAt: customer.cancelled_at || undefined,
        isTrialAccount: customer.is_trial || false,
        isTrial: customer.is_trial || false, // Add for backward compatibility
        highlevelContactId: customer.highlevel_contact_id || undefined,
        provider: customer.provider || '8k',
        connectionNumber: customer.connection_number || undefined,
        customerGroupId: customer.customer_group_id || undefined,
        m3uUrl: customer.m3u_url || undefined,
        createdAt: customer.created_at,
      }));

      setCustomers(formattedCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    }
  };

  const refreshData = useCallback(async () => {
    setLoading(true);
    setIsLoading(true);
    try {
      await Promise.all([fetchUser(user?.id || ''), fetchResellers(), fetchCustomers(), fetchCreditLogs()]);
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  }, [user?.id]);

  const addCredits = async (resellerId: string, credits: number, notes?: string): Promise<boolean> => {
    try {
      const { data: currentCreditsData, error: currentCreditsError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();

      if (currentCreditsError) {
        console.error('Error fetching current credits:', currentCreditsError);
        toast.error('Failed to fetch current credits');
        return false;
      }

      const currentCredits = currentCreditsData?.credits || 0;

      const { error } = await supabase
        .from('profiles')
        .update({ credits: currentCredits + credits })
        .eq('id', resellerId);

      if (error) {
        console.error('Error adding credits:', error);
        toast.error('Failed to add credits');
        return false;
      }

      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'addition',
          credits_used: credits,
          notes: notes || 'Credits added by admin',
        });

      if (logError) {
        console.error('Error logging credit transaction:', logError);
      }

      await Promise.all([fetchResellers(), fetchCreditLogs()]);
      if (user?.role === 'admin') {
        await fetchUser(user.id);
      }
      return true;
    } catch (error) {
      console.error('Error in addCredits function:', error);
      toast.error('An error occurred while adding credits');
      return false;
    }
  };

  const removeCredits = async (resellerId: string, credits: number, notes?: string): Promise<boolean> => {
    try {
      const { data: currentCreditsData, error: currentCreditsError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();

      if (currentCreditsError) {
        console.error('Error fetching current credits:', currentCreditsError);
        toast.error('Failed to fetch current credits');
        return false;
      }

      const currentCredits = currentCreditsData?.credits || 0;

      if (currentCredits < credits) {
        toast.error('Not enough credits available to remove.');
        return false;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ credits: currentCredits - credits })
        .eq('id', resellerId);

      if (error) {
        console.error('Error removing credits:', error);
        toast.error('Failed to remove credits');
        return false;
      }

      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'deduction',
          credits_used: credits,
          notes: notes || 'Credits removed by admin',
        });

      if (logError) {
        console.error('Error logging credit transaction:', logError);
      }

      await Promise.all([fetchResellers(), fetchCreditLogs()]);
      if (user?.role === 'admin') {
        await fetchUser(user.id);
      }
      return true;
    } catch (error) {
      console.error('Error in removeCredits function:', error);
      toast.error('An error occurred while removing credits');
      return false;
    }
  };

  const addReseller = async (email: string, name: string): Promise<boolean> => {
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: 'defaultpassword',
        user_metadata: {
          name: name,
          role: 'reseller',
        },
      });

      if (authError) {
        console.error('Error creating user:', authError);
        toast.error('Failed to create user');
        return false;
      }

      const newUserId = authData.user?.id;

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: newUserId,
          email: email,
          name: name,
          role: 'reseller',
          credits: 0,
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        toast.error('Failed to create profile');
        await supabase.auth.admin.deleteUser(newUserId || '');
        return false;
      }

      await fetchResellers();
      return true;
    } catch (error) {
      console.error('Error in addReseller function:', error);
      toast.error('An error occurred while adding reseller');
      return false;
    }
  };

  const getReseller = (resellerId: string): Profile | undefined => {
    return resellers.find(reseller => reseller.id === resellerId);
  };

  const addCustomer = async (customerData: NewCustomerData): Promise<boolean> => {
    if (!user) return false;

    try {
      console.log('🚀 AppContext: Starting customer creation process');
      console.log('📊 Customer Data:', customerData);

      const { data: creditsNeeded, error: creditsError } = await supabase.rpc('calculate_credits_required', {
        connections: customerData.maxConnections || customerData.connections,
        duration_months: customerData.planDuration
      });

      if (creditsError) {
        console.error('❌ Error calculating credits:', creditsError);
        toast.error('Failed to calculate required credits');
        return false;
      }

      console.log(`💰 Credits needed: ${creditsNeeded}`);

      if (user.credits < creditsNeeded) {
        console.error(`❌ Insufficient credits: ${user.credits} available, ${creditsNeeded} required`);
        toast.error(`Insufficient credits. You need ${creditsNeeded} credits but only have ${user.credits}.`);
        return false;
      }

      let functionName = 'create-iptv-user';
      if (customerData.accountType === 'mag') {
        functionName = 'create-mag-user';
      }

      console.log(`🔧 Using edge function: ${functionName}`);

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          resellerId: customerData.resellerId,
          customerData: {
            ...customerData,
            maxConnections: customerData.maxConnections || customerData.connections,
            currentConnections: 0,
            connectionDetails: []
          }
        }
      });

      if (error) {
        console.error(`❌ Edge function error:`, error);
        toast.error(`Failed to create ${customerData.accountType.toUpperCase()} account: ${error.message}`);
        return false;
      }

      if (!data?.success) {
        console.error(`❌ Edge function returned failure:`, data);
        toast.error(data?.error || `Failed to create ${customerData.accountType.toUpperCase()} account`);
        return false;
      }

      console.log(`✅ Customer created successfully:`, data);

      await Promise.all([fetchCustomers(), fetchResellers(), fetchCreditLogs()]);

      toast.success(`${customerData.accountType.toUpperCase()} customer created successfully with ${customerData.maxConnections || customerData.connections} connection${(customerData.maxConnections || customerData.connections) > 1 ? 's' : ''}!`);
      return true;

    } catch (error: any) {
      console.error('💥 AppContext: Unexpected error during customer creation:', error);
      toast.error(`An error occurred while creating the ${customerData.accountType} customer: ${error.message}`);
      return false;
    }
  };

  const cancelCustomer = async (customerId: string): Promise<boolean> => {
    try {
      console.log(`🚫 AppContext: Starting cancellation process for customer ID: ${customerId}`);

      setCustomers(prevCustomers =>
        prevCustomers.map(customer =>
          customer.id === customerId ? { ...customer, status: 'cancelled', cancelledAt: new Date().toISOString() } : customer
        )
      );

      const { error: updateError } = await supabase
        .from('customers')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', customerId);

      if (updateError) {
        console.error(`❌ AppContext: Error updating customer status in database:`, updateError);
        toast.error('Failed to cancel customer account');
        await fetchCustomers();
        return false;
      }

      console.log(`✅ AppContext: Customer ${customerId} cancelled successfully in database`);
      toast.success('Customer cancelled successfully');
      return true;
    } catch (error) {
      console.error('💥 AppContext: Unexpected error during customer cancellation:', error);
      toast.error('An error occurred while cancelling the customer account');
      await fetchCustomers();
      return false;
    }
  };

  const deactivateCustomer = async (customerId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_deactivated: true, status: 'deactivated' })
        .eq('id', customerId);

      if (error) {
        console.error('Error deactivating customer:', error);
        return false;
      }

      await fetchCustomers();
      return true;
    } catch (error) {
      console.error('Error in deactivateCustomer function:', error);
      return false;
    }
  };

  const activateCustomer = async (customerId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_deactivated: false, status: 'active' })
        .eq('id', customerId);

      if (error) {
        console.error('Error activating customer:', error);
        return false;
      }

      await fetchCustomers();
      return true;
    } catch (error) {
      console.error('Error in activateCustomer function:', error);
      return false;
    }
  };

  const updateCustomer = async (customerId: string, updates: Partial<Customer>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', customerId);

      if (error) {
        console.error('Error updating customer:', error);
        toast.error('Failed to update customer');
        return false;
      }

      await fetchCustomers();
      return true;
    } catch (error) {
      console.error('Error in updateCustomer function:', error);
      toast.error('An error occurred while updating the customer');
      return false;
    }
  };

  const renewCustomer = async (customerId: string, duration: number): Promise<boolean> => {
    try {
      const customer = customers.find(c => c.id === customerId);
      if (!customer) {
        toast.error('Customer not found');
        return false;
      }

      const creditsNeeded = await supabase.rpc('calculate_credits_required', {
        connections: customer.maxConnections || 1,
        duration_months: duration
      });

      if (!user || user.credits < creditsNeeded.data) {
        toast.error('Insufficient credits');
        return false;
      }

      const newExpirationDate = new Date(customer.expirationDate);
      newExpirationDate.setMonth(newExpirationDate.getMonth() + duration);

      const { error } = await supabase
        .from('customers')
        .update({ 
          expiration_date: newExpirationDate.toISOString().split('T')[0],
          status: 'active'
        })
        .eq('id', customerId);

      if (error) {
        console.error('Error renewing customer:', error);
        toast.error('Failed to renew customer');
        return false;
      }

      await Promise.all([fetchCustomers(), fetchResellers(), fetchCreditLogs()]);
      toast.success('Customer renewed successfully');
      return true;
    } catch (error) {
      console.error('Error in renewCustomer function:', error);
      toast.error('An error occurred while renewing the customer');
      return false;
    }
  };

  const createTrialAccount = async (email: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: trialLimit, error: trialLimitError } = await supabase
        .from('daily_trial_limits')
        .select('trial_count')
        .eq('date', today)
        .eq('provider', user.provider || '8k')
        .single();

      if (trialLimitError) {
        console.error('Error checking trial limit:', trialLimitError);
        toast.error('Failed to check trial limit');
        return false;
      }

      const trialCount = trialLimit?.trial_count || 0;
      if (trialCount >= 5) {
        toast.error('Daily trial limit reached. Please try again tomorrow.');
        return false;
      }

      const { data, error } = await supabase.functions.invoke('create-trial-account', {
        body: {
          resellerId: user.id,
          email: email,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        toast.error('Failed to create trial account');
        return false;
      }

      if (!data?.success) {
        console.error('Edge function returned failure:', data);
        toast.error(data?.error || 'Failed to create trial account');
        return false;
      }

      const { error: updateError } = await supabase
        .from('daily_trial_limits')
        .upsert({
          date: today,
          provider: user.provider || '8k',
          trial_count: trialCount + 1,
        }, { onConflict: 'date,provider' });

      if (updateError) {
        console.error('Error updating trial limit:', updateError);
      }

      await fetchCustomers();
      toast.success('Trial account created successfully!');
      return true;
    } catch (error) {
      console.error('Error in createTrialAccount function:', error);
      toast.error('An error occurred while creating the trial account');
      return false;
    }
  };

  const updateConnectionCount = async (customerId: string, connectionChange: number): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('update_connection_count', {
        customer_id: customerId,
        connection_change: connectionChange
      });

      if (error) {
        console.error('Error updating connection count:', error);
        return false;
      }

      if (!data) {
        console.error('Connection limit exceeded or invalid change');
        return false;
      }

      await fetchCustomers();
      return true;
    } catch (error) {
      console.error('Error updating connection count:', error);
      return false;
    }
  };

  const validateConnectionLimit = async (customerId: string, newConnections: number): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('validate_connection_limit', {
        customer_id: customerId,
        new_connections: newConnections
      });

      if (error) {
        console.error('Error validating connection limit:', error);
        return false;
      }

      return data;
    } catch (error) {
      console.error('Error validating connection limit:', error);
      return false;
    }
  };

  const value = {
    session,
    user,
    resellers,
    customers,
    creditLogs,
    loading,
    isLoading,
    refreshData,
    addCredits,
    removeCredits,
    addReseller,
    getReseller,
    addCustomer,
    cancelCustomer,
    deactivateCustomer,
    activateCustomer,
    updateCustomer,
    renewCustomer,
    createTrialAccount,
    updateConnectionCount,
    validateConnectionLimit,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
