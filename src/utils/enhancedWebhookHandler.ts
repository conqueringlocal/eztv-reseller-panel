
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
  data?: {
    customers?: any[];
    creditsUsed?: number;
    totalConnections?: number;
    accountType?: string;
    accountsRenewed?: number;
    trialExpiresAt?: string;
  };
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
          startDate: new Date().toISOString().split('T')[0],
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
        errors: [error?.message || 'Unknown error']
      };
    }

    return {
      success: true,
      message: `Trial account created successfully with ${connections} connection${connections > 1 ? 's' : ''} for ${trialDurationHours} hours`,
      data: {
        customers: data.customers,
        totalConnections: connections,
        trialExpiresAt: expirationDate.toISOString(),
        accountType: 'trial'
      }
    };
  } catch (error) {
    console.error('💥 Error handling trial creation:', error);
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
    const startDate = new Date().toISOString().split('T')[0];
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
          startDate: startDate,
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
        errors: [error?.message || 'Unknown error']
      };
    }

    return {
      success: true,
      message: `Account created successfully with ${connections} connection${connections > 1 ? 's' : ''}`,
      data: {
        customers: data.customers,
        creditsUsed: creditsRequired,
        totalConnections: connections,
        accountType: accountType
      }
    };
  } catch (error) {
    console.error('💥 Error handling account creation:', error);
    return {
      success: false,
      message: 'Internal error creating account',
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

    return {
      success: true,
      message: `Customer renewed successfully. ${data.accountsRenewed} accounts renewed for ${payload.customer.plan_duration_months} months`,
      data: {
        accountsRenewed: data.accountsRenewed,
        creditsUsed: data.creditsUsed
      }
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
