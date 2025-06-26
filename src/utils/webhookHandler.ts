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

export const processWebhook = async (payload: WebhookPayload): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('Processing webhook payload:', payload);

    // Validate required fields
    if (!payload.resellerId) {
      return { success: false, message: 'Missing reseller ID' };
    }

    if (!payload.customer?.name || !payload.customer?.email) {
      return { success: false, message: 'Missing required customer information (name and email)' };
    }

    // Check if reseller exists
    const { data: resellerData, error: resellerError } = await supabase
      .from('profiles')
      .select('id, credits')
      .eq('id', payload.resellerId)
      .single();

    if (resellerError || !resellerData) {
      return { success: false, message: 'Invalid reseller ID' };
    }

    if (payload.action === 'create') {
      // Check if reseller has enough credits
      if (resellerData.credits < 1) {
        return { success: false, message: 'Insufficient credits' };
      }

      // Generate credentials
      const username = `user_${Date.now()}`;
      const password = Math.random().toString(36).substring(2, 15);
      
      // Calculate expiration date
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
        customerGroup: undefined,
        connectionSequence: 1,
        maxConnections: 1,
        m3uUrl: '',
        isTrial: false,
        startDate: new Date().toISOString().split('T')[0]
      };

      const result = await createCustomerRecord(customerData, payload.resellerId);
      
      if (!result.success) {
        return { success: false, message: result.error || 'Failed to create customer' };
      }

      // Deduct credit
      await supabase
        .from('profiles')
        .update({ credits: resellerData.credits - 1 })
        .eq('id', payload.resellerId);

      // Log credit usage
      await supabase
        .from('credit_logs')
        .insert({
          reseller_id: payload.resellerId,
          action: 'account_creation',
          credits_used: 1,
          customer_name: payload.customer.name,
          customer_id: result.customerId,
          notes: 'Customer created via webhook'
        });

      return { success: true, message: `Customer ${payload.customer.name} created successfully` };

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
        return { success: false, message: 'Customer not found for renewal' };
      }

      // Check if reseller has enough credits
      if (resellerData.credits < 1) {
        return { success: false, message: 'Insufficient credits for renewal' };
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
        return { success: false, message: 'Failed to renew customer' };
      }

      // Deduct credit
      await supabase
        .from('profiles')
        .update({ credits: resellerData.credits - 1 })
        .eq('id', payload.resellerId);

      // Log credit usage
      await supabase
        .from('credit_logs')
        .insert({
          reseller_id: payload.resellerId,
          action: 'account_creation',
          credits_used: 1,
          customer_name: payload.customer.name,
          customer_id: existingCustomer.id,
          notes: 'Customer renewed via webhook'
        });

      return { success: true, message: `Customer ${payload.customer.name} renewed successfully` };
    }

    return { success: false, message: 'Invalid action specified' };

  } catch (error) {
    console.error('Error processing webhook:', error);
    return { success: false, message: 'Internal server error' };
  }
};

export const processWebhookData = async (
  webhookData: WebhookData,
  resellerId: string
): Promise<Omit<Customer, 'id' | 'createdAt'>> => {
  return {
    name: webhookData.name,
    email: webhookData.email,
    username: `${webhookData.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`, // Fixed: Added username
    macAddress: webhookData.macAddress || '',
    deviceType: webhookData.deviceType || 'Smart TV',
    packageId: webhookData.packageId || 'default', // Fixed: Added packageId
    password: webhookData.password || '',
    expirationDate: webhookData.expirationDate,
    status: webhookData.status || 'active',
    resellerId: resellerId,
    planDuration: webhookData.planDuration || 1,
    maxConnections: webhookData.maxConnections || 1, // Fixed: Added maxConnections
    currentConnections: 0, // Fixed: Added currentConnections
    connectionDetails: [], // Fixed: Added connectionDetails
    isDeactivated: false,
    startDate: new Date().toISOString().split('T')[0],
    provider: '8k', // Fixed: Added provider
  };
};
