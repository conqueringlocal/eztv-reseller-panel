
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
    plan_duration_months?: number; // Optional - only for paid plans
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

// Get reseller data by API key
async function getResellerByApiKey(apiKey: string): Promise<ResellerDataResult['data'] | null> {
  try {
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('reseller_api_keys')
      .select(`
        reseller_id,
        is_active,
        profiles!inner(credits, name, provider)
      `)
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();

    if (apiKeyError || !apiKeyData) {
      console.error('❌ Invalid or inactive API key:', apiKeyError);
      return null;
    }

    return {
      resellerId: apiKeyData.reseller_id,
      credits: apiKeyData.profiles.credits,
      name: apiKeyData.profiles.name,
      provider: apiKeyData.profiles.provider || 'trex'
    };
  } catch (error) {
    console.error('💥 Error getting reseller by API key:', error);
    return null;
  }
}

// Create trial account function (Trex only)
async function createTrialAccount(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerName: string, 
  provider: string
): Promise<EnhancedWebhookResult> {
  try {
    console.log('🆓 Creating trial account via create-trial-user function');

    // Validate that this is a Trex reseller
    if (provider !== 'trex') {
      console.log(`❌ Trial creation rejected. Provider: ${provider}, Required: trex`);
      return {
        success: false,
        message: 'Trial accounts are only available for Trex resellers',
        errors: ['invalid_provider_for_trials']
      };
    }

    const connections = payload.connections || 1;
    const trialDurationHours = payload.trial_duration_hours || 24;

    // Calculate trial expiration
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + trialDurationHours);
    const startDate = new Date();

    // Create trial account using the create-trial-user function (now the renamed Trex function)
    const { data, error } = await supabase.functions.invoke('create-trial-user', {
      body: {
        resellerId: resellerId,
        customerData: {
          name: payload.customer.name,
          email: payload.customer.email,
          macAddress: payload.customer.mac || null,
          deviceType: payload.customer.device_type || 'Smart TV',
          connections: connections,
          maxConnections: connections,
          startDate: startDate.toISOString().split('T')[0],
          expirationDate: expirationDate.toISOString().split('T')[0],
          status: 'active',
          isDeactivated: false,
          isTrial: true,
          trialDurationHours: trialDurationHours,
          highlevelContactId: payload.contact_id
        }
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to create trial account:', error || data);
      return {
        success: false,
        message: 'Failed to create trial account',
        raw_api_response: data,
        errors: [error?.message || 'Unknown error']
      };
    }

    console.log('✅ Trial account created successfully');

    return {
      success: true,
      message: `Trial account created successfully for ${trialDurationHours} hours`,
      name: payload.customer.name,
      email: payload.customer.email,
      device_type: payload.customer.device_type || 'Smart TV',
      start_date: startDate.toISOString().split('T')[0],
      end_date: expirationDate.toISOString().split('T')[0],
      account_type: 'trial',
      trial_expires_at: expirationDate.toISOString(),
      total_connections: connections,
      username: data.customer?.username,
      password: data.customer?.password,
      m3u_url: data.customer?.m3uUrl,
      username_1: data.customer?.username,
      password_1: data.customer?.password,
      m3u_url_1: data.customer?.m3uUrl,
      raw_api_response: data
    };
  } catch (error) {
    console.error('💥 Error creating trial account:', error);
    return {
      success: false,
      message: 'Internal error creating trial account',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

// Create multi-connection account function
async function createMultiConnectionAccount(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerData: any
): Promise<EnhancedWebhookResult> {
  try {
    console.log('➕ Creating multi-connection account');

    const connections = payload.connections || 1;
    const planDuration = payload.customer.plan_duration_months || 1;
    const creditsRequired = connections * planDuration;

    // Check credits
    if (resellerData.credits < creditsRequired) {
      return {
        success: false,
        message: `Insufficient credits. Required: ${creditsRequired}, Available: ${resellerData.credits}`,
        errors: ['insufficient_credits']
      };
    }

    // Calculate dates
    const startDate = new Date();
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + planDuration);

    // Determine account type
    const accountType = payload.customer.mac && connections === 1 ? 'mag' : 'm3u';

    // Create account via create-iptv-user function
    const { data, error } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        resellerId: resellerId,
        serviceCall: true,
        customerData: {
          name: payload.customer.name,
          email: payload.customer.email,
          macAddress: payload.customer.mac,
          deviceType: payload.customer.device_type || 'Smart TV',
          packageId: payload.customer.package_id || 'default',
          planDuration: planDuration,
          connections: connections,
          maxConnections: connections,
          startDate: startDate.toISOString().split('T')[0],
          expirationDate: expirationDate.toISOString().split('T')[0],
          accountType: accountType,
          status: 'active',
          isDeactivated: false
        }
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to create account:', error || data);
      return {
        success: false,
        message: 'Failed to create account',
        raw_api_response: data,
        errors: [error?.message || 'Unknown error']
      };
    }

    console.log('✅ Account created successfully');

    return {
      success: true,
      message: `Account created successfully with ${connections} connection${connections > 1 ? 's' : ''}`,
      name: payload.customer.name,
      email: payload.customer.email,
      device_type: payload.customer.device_type || 'Smart TV',
      start_date: startDate.toISOString().split('T')[0],
      end_date: expirationDate.toISOString().split('T')[0],
      account_type: accountType,
      credits_used: creditsRequired,
      total_connections: connections,
      raw_api_response: data
    };
  } catch (error) {
    console.error('💥 Error creating account:', error);
    return {
      success: false,
      message: 'Internal error creating account',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

// Renew customer group function
async function renewCustomerGroup(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerData: any
): Promise<EnhancedWebhookResult> {
  try {
    console.log('🔄 Renewing customer group');

    const planDuration = payload.customer.plan_duration_months || 1;

    // Find existing customer
    const { data: customers, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('reseller_id', resellerId)
      .eq('name', payload.customer.name)
      .eq('email', payload.customer.email)
      .in('status', ['active', 'expired', 'expiring_soon'])
      .limit(1);

    if (findError || !customers || customers.length === 0) {
      return {
        success: false,
        message: `No customer found with name "${payload.customer.name}" and email "${payload.customer.email}"`,
        errors: ['customer_not_found']
      };
    }

    const customer = customers[0];

    // Use the renew-customer-group function
    const { data, error } = await supabase.functions.invoke('renew-customer-group', {
      body: {
        customerId: customer.id,
        planDuration: planDuration,
        resellerId: resellerId
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to renew customer:', error || data);
      return {
        success: false,
        message: data?.message || 'Failed to renew customer',
        errors: [error?.message || 'renewal_failed']
      };
    }

    // Calculate new end date
    const currentExpiry = new Date(customer.expiration_date);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setMonth(newExpiry.getMonth() + planDuration);

    return {
      success: true,
      message: `Customer renewed successfully. ${data.accountsRenewed} accounts renewed for ${planDuration} months`,
      name: payload.customer.name,
      email: payload.customer.email,
      device_type: customer.device_type || 'Smart TV',
      start_date: customer.start_date,
      end_date: newExpiry.toISOString().split('T')[0],
      account_type: customer.mac_address ? 'mag' : 'm3u',
      accounts_renewed: data.accountsRenewed,
      credits_used: data.creditsUsed
    };
  } catch (error) {
    console.error('💥 Error renewing customer:', error);
    return {
      success: false,
      message: 'Internal error during renewal',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

export const processEnhancedWebhook = async (payload: EnhancedWebhookPayload): Promise<EnhancedWebhookResult> => {
  try {
    console.log('🚀 Processing enhanced webhook payload with Trex-only trials:', JSON.stringify(payload, null, 2));
    
    // Validate payload structure
    if (!payload.action) {
      return {
        success: false,
        message: 'Missing action field in webhook payload',
        errors: ['missing_action']
      };
    }
    
    // Validate trial payload - ensure no plan_duration_months for trials
    if (payload.action === 'trial' && payload.customer.plan_duration_months) {
      console.log('⚠️ WARNING: Trial action should not include plan_duration_months. Removing it.');
      delete payload.customer.plan_duration_months;
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
        provider: reseller.provider || 'trex'
      };
    } else {
      return {
        success: false,
        message: 'Missing API key or reseller ID in webhook payload',
        errors: ['missing_auth']
      };
    }
    
    console.log(`✅ Reseller authenticated: ${resellerData.name} (${resellerData.resellerId}) - Provider: ${resellerData.provider}`);
    
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
