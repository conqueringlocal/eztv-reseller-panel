import { supabase } from '@/integrations/supabase/client';

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
}

export interface EnhancedWebhookResult {
  success: boolean;
  message: string;
  // Direct credential fields at root level
  username?: string;
  password?: string;
  m3u_url?: string;
  // Flattened response structure for HighLevel compatibility
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
  // Connection credentials (up to 3 connections)
  username_1?: string;
  password_1?: string;
  m3u_url_1?: string;
  username_2?: string;
  password_2?: string;
  m3u_url_2?: string;
  username_3?: string;
  password_3?: string;
  m3u_url_3?: string;
  // Clean credentials array for multiple connections
  credentials?: Array<{
    username: string;
    password: string;
    m3u_url?: string;
  }>;
  // Raw data dump for debugging
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

// Fixed credential extraction function
function extractAndFlattenCredentials(data: any): {
  flattenedFields: any;
  credentialsArray: Array<{ username: string; password: string; m3u_url?: string }>;
  primaryCredentials: { username?: string; password?: string; m3u_url?: string };
} {
  console.log('🔍 RAW API RESPONSE DUMP:', JSON.stringify(data, null, 2));
  
  const flattenedFields: any = {};
  const credentialsArray: Array<{ username: string; password: string; m3u_url?: string }> = [];
  let primaryCredentials: { username?: string; password?: string; m3u_url?: string } = {};
  
  if (!data) {
    console.log('❌ No data provided for credential extraction');
    return { flattenedFields, credentialsArray, primaryCredentials };
  }
  
  let customers: any[] = [];
  
  // Extract customers from different response formats
  if (data.customers && Array.isArray(data.customers)) {
    customers = data.customers;
    console.log('✅ Found customers array with', customers.length, 'customers');
  } else if (data.customer) {
    customers = [data.customer];
    console.log('✅ Found single customer object');
  } else if (data.username || data.password || data.m3u_url) {
    customers = [data];
    console.log('✅ Data appears to be a customer object');
  }
  
  console.log('📊 Processing customers for credential extraction:', customers.length);
  
  // Process each customer to extract credentials
  customers.forEach((customer, index) => {
    console.log(`🔐 Processing customer ${index + 1}:`, {
      id: customer.id,
      name: customer.name,
      hasCredentials: !!customer.credentials,
      hasDirectUsername: !!customer.username,
      hasConnectionList: !!customer.connection_list
    });
    
    let username: string | undefined;
    let password: string | undefined;
    let m3u_url: string | undefined;
    
    // Try to extract credentials from different locations
    if (customer.credentials) {
      // Credentials are in a nested credentials object
      console.log(`📋 Found credentials object for customer ${index + 1}:`, customer.credentials);
      username = customer.credentials.username;
      password = customer.credentials.password;
      m3u_url = customer.credentials.m3uUrl || customer.credentials.m3u_url;
    } else if (customer.username) {
      // Credentials are directly on the customer object
      console.log(`📋 Found direct credentials for customer ${index + 1}`);
      username = customer.username;
      password = customer.password;
      m3u_url = customer.m3u_url;
    }
    
    if (username && password) {
      const credentialSet = {
        username,
        password,
        m3u_url: m3u_url || undefined
      };
      
      // Add to credentials array
      credentialsArray.push(credentialSet);
      
      // Set primary credentials (first valid set)
      if (index === 0) {
        primaryCredentials = credentialSet;
      }
      
      // Add to flattened fields (up to 3 connections)
      if (index < 3) {
        const fieldNumber = index + 1;
        flattenedFields[`username_${fieldNumber}`] = username;
        flattenedFields[`password_${fieldNumber}`] = password;
        if (m3u_url) {
          flattenedFields[`m3u_url_${fieldNumber}`] = m3u_url;
        }
      }
      
      console.log(`✅ Extracted credentials for customer ${index + 1}:`, { username, password, hasM3u: !!m3u_url });
    } else {
      console.log(`❌ No valid credentials found for customer ${index + 1}`);
    }
  });
  
  // Handle consolidated customer with connection_list
  if (customers.length === 1 && customers[0].connection_list && Array.isArray(customers[0].connection_list)) {
    console.log('🔄 Processing consolidated customer with connection_list');
    const connectionList = customers[0].connection_list;
    
    connectionList.forEach((connection: any, index: number) => {
      if (connection.username && connection.password) {
        const credentialSet = {
          username: connection.username,
          password: connection.password,
          m3u_url: connection.m3u_url || undefined
        };
        
        credentialsArray.push(credentialSet);
        
        if (index === 0) {
          primaryCredentials = credentialSet;
        }
        
        if (index < 3) {
          const fieldNumber = index + 1;
          flattenedFields[`username_${fieldNumber}`] = connection.username;
          flattenedFields[`password_${fieldNumber}`] = connection.password;
          if (connection.m3u_url) {
            flattenedFields[`m3u_url_${fieldNumber}`] = connection.m3u_url;
          }
        }
        
        console.log(`✅ Extracted connection ${index + 1}:`, credentialSet);
      }
    });
  }
  
  flattenedFields.total_connections = credentialsArray.length;
  
  console.log('🎯 Final extraction results:', {
    primaryCredentials,
    credentialsCount: credentialsArray.length,
    flattenedFieldsCount: Object.keys(flattenedFields).length
  });
  
  return { flattenedFields, credentialsArray, primaryCredentials };
}

export const processEnhancedWebhook = async (payload: EnhancedWebhookPayload): Promise<EnhancedWebhookResult> => {
  try {
    console.log('🚀 Processing enhanced webhook payload:', payload);

    // Validate required fields based on action
    const validationResult = validateWebhookPayload(payload);
    if (!validationResult.valid) {
      return {
        success: false,
        message: validationResult.message,
        errors: validationResult.errors
      };
    }

    // Process based on action type
    switch (payload.action) {
      case 'trial':
        return await handleTrialCreation(payload);
      
      case 'create':
        return await handleAccountCreation(payload);
      
      case 'renew':
        return await handleAccountRenewal(payload);
      
      default:
        return {
          success: false,
          message: `Unsupported action: ${payload.action}`,
          errors: ['unsupported_action']
        };
    }
  } catch (error) {
    console.error('💥 Error processing enhanced webhook:', error);
    return {
      success: false,
      message: 'Internal server error',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
};

function validateWebhookPayload(payload: EnhancedWebhookPayload): {
  valid: boolean;
  message: string;
  errors: string[];
} {
  const errors: string[] = [];

  if (!payload.action) {
    errors.push('Missing action field');
  }

  if (!payload.customer?.name) {
    errors.push('Missing customer name');
  }

  if (!payload.customer?.email) {
    errors.push('Missing customer email');
  }

  if (!payload.customer?.plan_duration_months || payload.customer.plan_duration_months <= 0) {
    errors.push('Invalid plan duration');
  }

  if (!payload.api_key && !payload.resellerId) {
    errors.push('Missing API key or reseller ID');
  }

  // Action-specific validations
  if (payload.action === 'create' || payload.action === 'trial') {
    if (payload.connections && (payload.connections < 1 || payload.connections > 10)) {
      errors.push('Invalid connections count (must be between 1 and 10)');
    }
  }

  return {
    valid: errors.length === 0,
    message: errors.length > 0 ? 'Validation failed' : 'Valid',
    errors
  };
}

async function handleTrialCreation(payload: EnhancedWebhookPayload): Promise<EnhancedWebhookResult> {
  try {
    console.log('🆓 Handling trial account creation');

    // Get reseller information
    const resellerData = await getResellerData(payload);
    if (!resellerData.success || !resellerData.data) {
      return {
        success: false,
        message: resellerData.message,
        errors: resellerData.errors
      };
    }

    const connections = payload.connections || 1;
    const trialDurationHours = payload.trial_duration_hours || 24;

    // Calculate trial expiration
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + trialDurationHours);
    const startDate = new Date();

    // Create trial account via create-iptv-user function
    const { data, error } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        resellerId: resellerData.data.resellerId,
        customerData: {
          name: payload.customer.name,
          email: payload.customer.email,
          macAddress: payload.customer.mac || null,
          deviceType: payload.customer.device_type || 'Smart TV',
          packageId: payload.customer.package_id || 'trial',
          planDuration: 1,
          connections: connections,
          maxConnections: connections,
          startDate: startDate.toISOString().split('T')[0],
          expirationDate: expirationDate.toISOString().split('T')[0],
          accountType: 'm3u',
          status: 'active',
          isDeactivated: false,
          isTrial: true,
          trialDurationHours: trialDurationHours
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

    console.log('📊 Trial account creation result:', JSON.stringify(data, null, 2));

    // Extract and validate credentials
    const { flattenedFields, credentialsArray, primaryCredentials } = extractAndFlattenCredentials(data);
    
    // Validate credentials exist before continuing
    if (!primaryCredentials.username || !primaryCredentials.password) {
      console.error('❌ CRITICAL: No valid credentials found in API response');
      return {
        success: false,
        message: 'Failed to extract valid credentials from trial account creation',
        raw_api_response: data,
        errors: ['missing_credentials']
      };
    }

    console.log('✅ Trial credentials validated successfully');

    return {
      success: true,
      message: `Trial account created successfully with ${connections} connection${connections > 1 ? 's' : ''} for ${trialDurationHours} hours`,
      // Primary credentials at root level
      username: primaryCredentials.username,
      password: primaryCredentials.password,
      m3u_url: primaryCredentials.m3u_url,
      // Standard fields
      name: payload.customer.name,
      email: payload.customer.email,
      device_type: payload.customer.device_type || 'Smart TV',
      start_date: startDate.toISOString().split('T')[0],
      end_date: expirationDate.toISOString().split('T')[0],
      account_type: 'trial',
      trial_expires_at: expirationDate.toISOString(),
      // Flattened credentials for HighLevel
      ...flattenedFields,
      // Clean credentials array
      credentials: credentialsArray,
      // Raw response for debugging
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

async function handleAccountCreation(payload: EnhancedWebhookPayload): Promise<EnhancedWebhookResult> {
  try {
    console.log('➕ Handling account creation');

    // Get reseller information
    const resellerData = await getResellerData(payload);
    if (!resellerData.success || !resellerData.data) {
      return {
        success: false,
        message: resellerData.message,
        errors: resellerData.errors
      };
    }

    const connections = payload.connections || 1;
    const planDuration = payload.customer.plan_duration_months;
    const creditsRequired = connections * planDuration;

    // Check credits
    if (resellerData.data.credits < creditsRequired) {
      return {
        success: false,
        message: `Insufficient credits. Required: ${creditsRequired}, Available: ${resellerData.data.credits}`,
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
        resellerId: resellerData.data.resellerId,
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

    console.log('📊 Account creation result:', JSON.stringify(data, null, 2));

    // Extract and validate credentials
    const { flattenedFields, credentialsArray, primaryCredentials } = extractAndFlattenCredentials(data);
    
    // Validate credentials exist before continuing
    if (!primaryCredentials.username || !primaryCredentials.password) {
      console.error('❌ CRITICAL: No valid credentials found in API response');
      return {
        success: false,
        message: 'Failed to extract valid credentials from account creation',
        raw_api_response: data,
        errors: ['missing_credentials']
      };
    }

    console.log('✅ Account credentials validated successfully');

    return {
      success: true,
      message: `Account created successfully with ${connections} connection${connections > 1 ? 's' : ''}`,
      // Primary credentials at root level
      username: primaryCredentials.username,
      password: primaryCredentials.password,
      m3u_url: primaryCredentials.m3u_url,
      // Standard fields
      name: payload.customer.name,
      email: payload.customer.email,
      device_type: payload.customer.device_type || 'Smart TV',
      start_date: startDate.toISOString().split('T')[0],
      end_date: expirationDate.toISOString().split('T')[0],
      account_type: accountType,
      credits_used: creditsRequired,
      // Flattened credentials for HighLevel
      ...flattenedFields,
      // Clean credentials array
      credentials: credentialsArray,
      // Raw response for debugging
      raw_api_response: data
    };
  } catch (error) {
    console.error('💥 Error handling account creation:', error);
    return {
      success: false,
      message: 'Internal error creating account',
      raw_api_response: null,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

async function handleAccountRenewal(payload: EnhancedWebhookPayload): Promise<EnhancedWebhookResult> {
  try {
    console.log('🔄 Handling account renewal');

    // Get reseller information
    const resellerData = await getResellerData(payload);
    if (!resellerData.success || !resellerData.data) {
      return {
        success: false,
        message: resellerData.message,
        errors: resellerData.errors
      };
    }

    // Find existing customer
    const { data: customers, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('reseller_id', resellerData.data.resellerId)
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
        planDuration: payload.customer.plan_duration_months,
        resellerId: resellerData.data.resellerId
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
    newExpiry.setMonth(newExpiry.getMonth() + payload.customer.plan_duration_months);

    return {
      success: true,
      message: `Customer renewed successfully. ${data.accountsRenewed} accounts renewed for ${payload.customer.plan_duration_months} months`,
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
    console.error('💥 Error handling account renewal:', error);
    return {
      success: false,
      message: 'Internal error during renewal',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

async function getResellerData(payload: EnhancedWebhookPayload): Promise<ResellerDataResult> {
  try {
    if (payload.api_key) {
      // Look up by API key
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('reseller_api_keys')
        .select(`
          reseller_id,
          is_active,
          profiles!inner(credits, name, provider)
        `)
        .eq('api_key', payload.api_key)
        .eq('is_active', true)
        .single();

      if (apiKeyError || !apiKeyData) {
        return {
          success: false,
          message: 'Invalid or inactive API key',
          errors: ['invalid_api_key']
        };
      }

      return {
        success: true,
        message: 'Reseller found',
        data: {
          resellerId: apiKeyData.reseller_id,
          credits: apiKeyData.profiles.credits,
          name: apiKeyData.profiles.name,
          provider: apiKeyData.profiles.provider || '8k'
        }
      };
    } else if (payload.resellerId) {
      // Look up by reseller ID (legacy)
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

      return {
        success: true,
        message: 'Reseller found',
        data: {
          resellerId: reseller.id,
          credits: reseller.credits,
          name: reseller.name,
          provider: reseller.provider || '8k'
        }
      };
    }

    return {
      success: false,
      message: 'Missing API key or reseller ID',
      errors: ['missing_auth']
    };
  } catch (error) {
    console.error('💥 Error getting reseller data:', error);
    return {
      success: false,
      message: 'Error looking up reseller',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}
