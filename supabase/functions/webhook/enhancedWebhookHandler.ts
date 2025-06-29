import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export interface EnhancedWebhookPayload {
  api_key?: string;
  resellerId?: string;
  contact_id?: string;
  action: 'create' | 'renew' | 'trial';
  connections?: number;
  is_trial?: boolean;
  trial_duration_hours?: number;
  customer: {
    name: string;
    email: string;
    mac?: string;
    device_type?: string;
    plan_duration_months: number;
    package_id?: string;
  };
  customerName?: string;
  customerEmail?: string;
  macAddress?: string;
  deviceType?: string;
  planDuration?: number;
  packageId?: string;
  contactId?: string;
}

export interface EnhancedWebhookResult {
  success: boolean;
  message: string;
  username?: string;
  password?: string;
  m3u_url?: string;
  name?: string;
  email?: string;
  device_type?: string;
  start_date?: string;
  end_date?: string;
  total_connections?: number;
  account_type?: string;
  credits_used?: number;
  accounts_renewed?: number;
  trial_expires_at?: string;
  username_1?: string;
  password_1?: string;
  m3u_url_1?: string;
  username_2?: string;
  password_2?: string;
  m3u_url_2?: string;
  username_3?: string;
  password_3?: string;
  m3u_url_3?: string;
  credentials?: Array<{
    username: string;
    password: string;
    m3u_url?: string;
  }>;
  raw_api_response?: any;
  errors?: string[];
}

interface ResellerDataResult {
  success: boolean;
  message: string;
  data?: {
    resellerId: string;
    credits: number;
    name: string;
    provider: string;
  };
  errors?: string[];
}

// Enhanced consolidation function for post-creation cleanup
async function consolidateCustomerIfNeeded(
  resellerId: string, 
  customerName: string, 
  customerEmail: string
): Promise<{ success: boolean; consolidatedId?: string }> {
  try {
    console.log('🔄 Checking for consolidation opportunities...');
    
    // Find customers with the same name and email
    const { data: existingCustomers, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('reseller_id', resellerId)
      .eq('name', customerName)
      .eq('email', customerEmail);
    
    if (findError || !existingCustomers || existingCustomers.length <= 1) {
      console.log('No consolidation needed');
      return { success: true };
    }
    
    // Use customer_group from first customer or create one
    const firstCustomer = existingCustomers[0];
    const customerGroup = firstCustomer.customer_group || `${customerName.toLowerCase().replace(/\s+/g, '_')}_${resellerId}`;
    
    // Call the database function to consolidate customer connections
    const { data, error } = await supabase.rpc('consolidate_customer_connections', {
      customer_group_name: customerGroup,
      reseller_id_param: resellerId
    });
    
    if (error) {
      console.error('❌ Consolidation error:', error);
      return { success: false };
    }
    
    // Handle the response properly - data should be an array
    const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
    
    if (result) {
      console.log('✅ Customer records consolidated:', result);
      return { 
        success: true, 
        consolidatedId: result.consolidated_customer_id 
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error('💥 Error during consolidation:', error);
    return { success: false };
  }
}

export const processEnhancedWebhook = async (payload: EnhancedWebhookPayload): Promise<EnhancedWebhookResult> => {
  try {
    console.log('🚀 Processing enhanced webhook payload with consolidation:', JSON.stringify(payload, null, 2));
    
    // Validate payload structure
    if (!payload.action) {
      return {
        success: false,
        message: 'Missing action field in webhook payload',
        errors: ['missing_action']
      };
    }
    
    // Get reseller information
    let resellerData = null;
    
    if (payload.api_key) {
      resellerData = await getResellerByApiKey(payload.api_key);
      if (!resellerData) {
        return {
          success: false,
          message: 'Invalid or inactive API key',
          errors: ['invalid_api_key']
        };
      }
    } else if (payload.resellerId) {
      // Legacy support
      const { data: reseller, error: resellerError } = await supabase
        .from('profiles')
        .select('id, credits, name, provider')
        .eq('id', payload.resellerId)
        .single();
      
      if (resellerError || !reseller) {
        return {
          success: false,
          message: 'Invalid reseller ID',
          errors: ['invalid_reseller']
        };
      }
      
      resellerData = {
        resellerId: reseller.id,
        credits: reseller.credits,
        name: reseller.name,
        provider: reseller.provider || '8k'
      };
    } else {
      return {
        success: false,
        message: 'Missing API key or reseller ID in webhook payload',
        errors: ['missing_auth']
      };
    }
    
    console.log(`✅ Reseller authenticated: ${resellerData.name} (${resellerData.resellerId})`);
    
    // Route to appropriate handler based on action
    switch (payload.action) {
      case 'trial':
        return await createTrialAccount(payload, resellerData.resellerId, resellerData.name, resellerData.provider);
      
      case 'create':
        return await createMultiConnectionAccount(payload, resellerData.resellerId, resellerData);
      
      case 'renew':
        return await renewCustomerGroup(payload, resellerData.resellerId, resellerData);
      
      default:
        return {
          success: false,
          message: `Unsupported action: ${payload.action}. Supported actions: create, renew, trial`,
          errors: ['unsupported_action']
        };
    }
  } catch (error) {
    console.error('💥 Fatal error processing enhanced webhook:', error);
    return {
      success: false,
      message: 'Internal server error processing webhook',
      errors: [error.message]
    };
  }
};
