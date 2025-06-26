import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/contexts/AppContext';

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
