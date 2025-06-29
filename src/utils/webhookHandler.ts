
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/contexts/AppContext';

export interface WebhookPayload {
  api_key?: string;
  resellerId: string;
  action: 'create' | 'renew';
  contact_id?: string;
  customer: {
    name: string;
    email: string;
    mac?: string;
    device_type?: string;
    plan_duration_months: number;
  };
}

export interface WebhookData {
  name: string;
  email: string;
  macAddress?: string;
  deviceType?: string;
  password?: string;
  expirationDate: string;
  status?: string;
  planDuration?: number;
  maxConnections?: number;
  packageId?: string;
}

// Flattened response structure for HighLevel compatibility
export interface LegacyWebhookResult {
  success: boolean;
  message: string;
  // Customer information
  name?: string;
  email?: string;
  device_type?: string;
  start_date?: string;
  end_date?: string;
  account_type?: string;
  // Single connection credentials (legacy format)
  username?: string;
  password?: string;
  m3u_url?: string;
  credits_used?: number;
  // Error information
  errors?: string[];
}

export const determineCustomerStatus = (expirationDate: string): 'active' | 'expired' | 'cancelled' | 'pending' => {
  const expiration = new Date(expirationDate);
  const now = new Date();
  
  if (expiration < now) {
    return 'expired';
  }
  
  return 'active';
};

export const createCustomerRecord = async (
  customerData: Omit<Customer, 'id' | 'createdAt'>,
  resellerId: string
): Promise<{ success: boolean; customerId?: string; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        reseller_id: resellerId,
        name: customerData.name,
        email: customerData.email,
        mac_address: customerData.macAddress,
        device_type: customerData.deviceType,
        username: customerData.username,
        password: customerData.password,
        expiration_date: customerData.expirationDate,
        status: customerData.status,
        plan_duration: customerData.planDuration,
        is_deactivated: customerData.isDeactivated,
        cancelled_at: customerData.cancelledAt,
        highlevel_contact_id: customerData.highlevelContactId,
        customer_group: customerData.customerGroup,
        connection_sequence: customerData.connectionSequence,
        max_connections: customerData.maxConnections,
        m3u_url: customerData.m3uUrl,
        is_trial: customerData.isTrial,
        start_date: customerData.startDate || new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating customer record:', error);
      return { success: false, error: error.message };
    }

    return { success: true, customerId: data.id };
  } catch (error) {
    console.error('Unexpected error creating customer record:', error);
    return { success: false, error: 'Unexpected error occurred' };
  }
};

// Legacy webhook processor with flattened response
export const processWebhook = async (payload: WebhookPayload): Promise<LegacyWebhookResult> => {
  try {
    console.log('📋 Processing legacy webhook payload:', payload);

    // Validate required fields
    if (!payload.resellerId) {
      return { success: false, message: 'Missing reseller ID', errors: ['missing_reseller_id'] };
    }

    if (!payload.customer?.name || !payload.customer?.email) {
      return { success: false, message: 'Missing required customer information (name and email)', errors: ['missing_customer_data'] };
    }

    // Check if reseller exists
    const { data: resellerData, error: resellerError } = await supabase
      .from('profiles')
      .select('id, credits')
      .eq('id', payload.resellerId)
      .single();

    if (resellerError || !resellerData) {
      return { success: false, message: 'Invalid reseller ID', errors: ['invalid_reseller'] };
    }

    if (payload.action === 'create') {
      // Check if reseller has enough credits (legacy assumes 1 connection)
      if (resellerData.credits < payload.customer.plan_duration_months) {
        return { 
          success: false, 
          message: 'Insufficient credits',
          errors: ['insufficient_credits']
        };
      }

      // Generate credentials
      const username = `user_${Date.now()}`;
      const password = Math.random().toString(36).substring(2, 15);
      
      // Calculate dates
      const startDate = new Date();
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + payload.customer.plan_duration_months);

      const customerData: Omit<Customer, 'id' | 'createdAt'> = {
        name: payload.customer.name,
        email: payload.customer.email,
        macAddress: payload.customer.mac,
        deviceType: payload.customer.device_type || 'Unknown',
        username: username,
        password: password,
        expirationDate: expirationDate.toISOString().split('T')[0],
        status: 'active',
        resellerId: payload.resellerId,
        planDuration: payload.customer.plan_duration_months,
        isDeactivated: false,
        cancelledAt: null,
        highlevelContactId: payload.contact_id,
        customerGroup: `${payload.customer.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`,
        connectionSequence: 1,
        maxConnections: 1,
        m3uUrl: '',
        isTrial: false,
        startDate: startDate.toISOString().split('T')[0],
        packageId: 'default',
        currentConnections: 0,
        connectionDetails: [],
        provider: '8k'
      };

      const result = await createCustomerRecord(customerData, payload.resellerId);
      
      if (!result.success) {
        return { 
          success: false, 
          message: result.error || 'Failed to create customer',
          errors: ['create_failed']
        };
      }

      // Deduct credit
      await supabase
        .from('profiles')
        .update({ credits: resellerData.credits - payload.customer.plan_duration_months })
        .eq('id', payload.resellerId);

      // Log credit usage
      await supabase
        .from('credit_logs')
        .insert({
          reseller_id: payload.resellerId,
          action: 'account_creation',
          credits_used: payload.customer.plan_duration_months,
          customer_name: payload.customer.name,
          customer_id: result.customerId,
          notes: 'Customer created via legacy webhook'
        });

      // Return flattened response for HighLevel compatibility
      return { 
        success: true, 
        message: `Customer ${payload.customer.name} created successfully`,
        name: payload.customer.name,
        email: payload.customer.email,
        device_type: payload.customer.device_type || 'Unknown',
        start_date: startDate.toISOString().split('T')[0],
        end_date: expirationDate.toISOString().split('T')[0],
        account_type: payload.customer.mac ? 'mag' : 'm3u',
        username: username,
        password: password,
        m3u_url: customerData.m3uUrl,
        credits_used: payload.customer.plan_duration_months
      };

    } else if (payload.action === 'renew') {
      // Find existing customer by name and email
      const { data: existingCustomer, error: findError } = await supabase
        .from('customers')
        .select('*')
        .eq('reseller_id', payload.resellerId)
        .eq('name', payload.customer.name)
        .eq('email', payload.customer.email)
        .single();

      if (findError || !existingCustomer) {
        return { 
          success: false, 
          message: 'Customer not found for renewal',
          errors: ['customer_not_found']
        };
      }

      // Check if reseller has enough credits
      if (resellerData.credits < payload.customer.plan_duration_months) {
        return { 
          success: false, 
          message: 'Insufficient credits for renewal',
          errors: ['insufficient_credits']
        };
      }

      // Calculate new expiration date
      const currentExpiration = new Date(existingCustomer.expiration_date);
      const newExpiration = new Date(currentExpiration);
      newExpiration.setMonth(newExpiration.getMonth() + payload.customer.plan_duration_months);

      // Update customer
      const { error: updateError } = await supabase
        .from('customers')
        .update({ 
          expiration_date: newExpiration.toISOString().split('T')[0],
          status: 'active',
          is_deactivated: false
        })
        .eq('id', existingCustomer.id);

      if (updateError) {
        return { 
          success: false, 
          message: 'Failed to renew customer',
          errors: ['renewal_failed']
        };
      }

      // Deduct credit
      await supabase
        .from('profiles')
        .update({ credits: resellerData.credits - payload.customer.plan_duration_months })
        .eq('id', payload.resellerId);

      // Log credit usage
      await supabase
        .from('credit_logs')
        .insert({
          reseller_id: payload.resellerId,
          action: 'account_creation',
          credits_used: payload.customer.plan_duration_months,
          customer_name: payload.customer.name,
          customer_id: existingCustomer.id,
          notes: 'Customer renewed via legacy webhook'
        });

      // Return flattened response for HighLevel compatibility
      return { 
        success: true, 
        message: `Customer ${payload.customer.name} renewed successfully`,
        name: payload.customer.name,
        email: payload.customer.email,
        device_type: existingCustomer.device_type || 'Unknown',
        start_date: existingCustomer.start_date,
        end_date: newExpiration.toISOString().split('T')[0],
        account_type: existingCustomer.mac_address ? 'mag' : 'm3u',
        username: existingCustomer.username,
        password: existingCustomer.password,
        m3u_url: existingCustomer.m3u_url,
        credits_used: payload.customer.plan_duration_months
      };
    }

    return { 
      success: false, 
      message: 'Invalid action specified',
      errors: ['invalid_action']
    };

  } catch (error) {
    console.error('Error processing legacy webhook:', error);
    return { 
      success: false, 
      message: 'Internal server error',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
};

export const processWebhookData = async (
  webhookData: WebhookData,
  resellerId: string
): Promise<Omit<Customer, 'id' | 'createdAt'>> => {
  return {
    name: webhookData.name,
    email: webhookData.email,
    username: `${webhookData.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`,
    macAddress: webhookData.macAddress || '',
    deviceType: webhookData.deviceType || 'Smart TV',
    packageId: webhookData.packageId || 'default',
    password: webhookData.password || '',
    expirationDate: webhookData.expirationDate,
    status: webhookData.status || 'active',
    resellerId: resellerId,
    planDuration: webhookData.planDuration || 1,
    maxConnections: webhookData.maxConnections || 1,
    currentConnections: 0,
    connectionDetails: [],
    isDeactivated: false,
    startDate: new Date().toISOString().split('T')[0],
    provider: '8k',
    cancelledAt: null,
    highlevelContactId: undefined,
    customerGroup: `${webhookData.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`,
    connectionSequence: 1,
    m3uUrl: '',
    isTrial: false
  };
};
