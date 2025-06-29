import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export interface EnhancedWebhookPayload {
  // API key for reseller identification
  api_key?: string;
  // Legacy reseller ID for backwards compatibility
  resellerId?: string;
  // HighLevel contact ID for sending credentials
  contact_id?: string;
  // Action type to differentiate between create, renew, and trial
  action: 'create' | 'renew' | 'trial';
  // Number of connections for multi-connection accounts
  connections?: number;
  // Trial account flag and duration
  is_trial?: boolean;
  trial_duration_hours?: number;
  customer: {
    name: string;
    email: string;
    mac?: string; // Optional for renewals and some account types
    device_type?: string; // Optional for renewals
    plan_duration_months: number;
    package_id?: string; // Optional package ID
  };
  // Support for older format for backwards compatibility
  customerName?: string;
  customerEmail?: string;
  macAddress?: string;
  deviceType?: string;
  planDuration?: number;
  packageId?: string;
  contactId?: string;
}

// Flattened webhook result for HighLevel compatibility
interface WebhookResult {
  success: boolean;
  message: string;
  // Customer information
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
  errors?: string[];
}

// Helper function to flatten customer credentials for HighLevel compatibility
function flattenCustomerCredentials(customers: any[]): any {
  const flattened: any = {};
  
  // Handle consolidated customer with connection_list
  if (customers.length === 1 && customers[0].connection_list) {
    const connectionList = customers[0].connection_list;
    connectionList.slice(0, 3).forEach((connection: any, index: number) => {
      const fieldNumber = index + 1;
      if (connection.username) {
        flattened[`username_${fieldNumber}`] = connection.username;
      }
      if (connection.password) {
        flattened[`password_${fieldNumber}`] = connection.password;
      }
      if (connection.m3u_url) {
        flattened[`m3u_url_${fieldNumber}`] = connection.m3u_url;
      }
    });
    
    flattened.total_connections = customers[0].total_connections || connectionList.length;
  } else {
    // Handle individual customer records
    customers.slice(0, 3).forEach((customer, index) => {
      const fieldNumber = index + 1;
      if (customer.username) {
        flattened[`username_${fieldNumber}`] = customer.username;
      }
      if (customer.password) {
        flattened[`password_${fieldNumber}`] = customer.password;
      }
      if (customer.m3u_url) {
        flattened[`m3u_url_${fieldNumber}`] = customer.m3u_url;
      }
    });
    
    flattened.total_connections = customers.length;
  }
  
  return flattened;
}

// Enhanced credit calculation for multi-connection accounts
function calculateCreditsRequired(connections: number, durationMonths: number): number {
  return connections * durationMonths;
}

// Get reseller by API key with enhanced validation
async function getResellerByApiKey(apiKey: string): Promise<{
  resellerId: string;
  credits: number;
  name: string;
  provider: string;
} | null> {
  try {
    console.log('🔍 Looking up reseller by API key');
    
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('reseller_api_keys')
      .select(`
        reseller_id,
        is_active,
        usage_count,
        profiles!inner(credits, name, provider)
      `)
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();

    if (apiKeyError || !apiKeyData) {
      console.error('❌ Invalid or inactive API key:', apiKey);
      return null;
    }

    // Update API key usage
    await supabase
      .from('reseller_api_keys')
      .update({ 
        usage_count: apiKeyData.usage_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('api_key', apiKey);

    return {
      resellerId: apiKeyData.reseller_id,
      credits: apiKeyData.profiles.credits,
      name: apiKeyData.profiles.name,
      provider: apiKeyData.profiles.provider || '8k'
    };
  } catch (error) {
    console.error('💥 Error looking up reseller:', error);
    return null;
  }
}

// Enhanced trial account creation with flattened response
async function createTrialAccount(
  payload: EnhancedWebhookPayload,
  resellerId: string,
  resellerName: string,
  provider: string
): Promise<WebhookResult> {
  try {
    console.log('🆓 Creating consolidated trial account');
    
    const trialDurationHours = payload.trial_duration_hours || 24;
    const connections = payload.connections || 1;
    
    // Calculate trial expiration
    const startDate = new Date();
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + trialDurationHours);
    
    const customerName = payload.customer?.name || payload.customerName || '';
    const customerEmail = payload.customer?.email || payload.customerEmail || '';
    const deviceType = payload.customer?.device_type || payload.deviceType || 'Smart TV';
    
    console.log(`🔄 Creating consolidated trial account with ${connections} connections for ${customerName}`);
    
    // Call the create-iptv-user function for trial accounts with serviceCall parameter
    const { data, error } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        resellerId: resellerId,
        serviceCall: true, // Enable service call mode to bypass JWT authentication
        customerData: {
          name: customerName,
          email: customerEmail,
          macAddress: payload.customer?.mac || payload.macAddress || null,
          deviceType: deviceType,
          packageId: payload.customer?.package_id || payload.packageId || 'trial',
          planDuration: 1, // Trial duration in months (will be overridden by hours)
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
        message: 'Failed to create trial IPTV account',
        errors: [error?.message || 'Unknown error']
      };
    }

    // Consolidate the customer connections if multiple were created
    if (data.customers?.length > 1) {
      console.log('🔄 Consolidating trial customer connections');
      const primaryCustomer = data.customers[0];
      const customerGroup = primaryCustomer.customer_group;
      
      await supabase.rpc('consolidate_customer_connections', {
        customer_group_name: customerGroup,
        reseller_id_param: resellerId
      });
    }

    // Send credentials via HighLevel if contact ID provided
    if (payload.contact_id && data.customers?.length > 0) {
      await syncCredentialsToHighLevel(
        payload.contact_id,
        customerName,
        customerEmail,
        data.customers,
        resellerId,
        deviceType
      );
    }

    // Flatten credentials for HighLevel compatibility
    const flattenedCredentials = flattenCustomerCredentials(data.customers || []);

    return {
      success: true,
      message: `Consolidated trial account created successfully with ${connections} connection${connections > 1 ? 's' : ''} for ${trialDurationHours} hours`,
      name: customerName,
      email: customerEmail,
      device_type: deviceType,
      start_date: startDate.toISOString().split('T')[0],
      end_date: expirationDate.toISOString().split('T')[0],
      account_type: 'trial',
      trial_expires_at: expirationDate.toISOString(),
      ...flattenedCredentials
    };
  } catch (error) {
    console.error('💥 Error creating trial account:', error);
    return {
      success: false,
      message: 'Internal error creating trial account',
      errors: [error.message]
    };
  }
}

// Enhanced multi-connection account creation with flattened response
async function createMultiConnectionAccount(
  payload: EnhancedWebhookPayload,
  resellerId: string,
  resellerData: any
): Promise<WebhookResult> {
  try {
    console.log('➕ Creating consolidated multi-connection account');
    
    const connections = payload.connections || 1;
    const planDuration = payload.customer?.plan_duration_months || payload.planDuration || 1;
    const creditsRequired = calculateCreditsRequired(connections, planDuration);
    
    console.log(`💰 Credits required: ${creditsRequired}, Available: ${resellerData.credits}`);
    
    // Check credits
    if (resellerData.credits < creditsRequired) {
      return {
        success: false,
        message: `Insufficient credits. Required: ${creditsRequired}, Available: ${resellerData.credits}`,
        errors: ['insufficient_credits']
      };
    }
    
    const customerName = payload.customer?.name || payload.customerName || '';
    const customerEmail = payload.customer?.email || payload.customerEmail || '';
    const macAddress = payload.customer?.mac || payload.macAddress;
    const deviceType = payload.customer?.device_type || payload.deviceType || 'Smart TV';
    
    // Validate required fields
    if (!customerName || !customerEmail) {
      return {
        success: false,
        message: 'Missing required customer information (name and email)',
        errors: ['missing_customer_data']
      };
    }
    
    // For multi-connection M3U accounts, MAC address is optional
    // For single MAG accounts, MAC address is required
    const accountType = macAddress && connections === 1 ? 'mag' : 'm3u';
    
    console.log(`🎯 Creating consolidated ${accountType} account with ${connections} connections`);
    
    // Calculate dates
    const startDate = new Date();
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + planDuration);
    
    // Call create-iptv-user function with serviceCall parameter
    const { data, error } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        resellerId: resellerId,
        serviceCall: true, // Enable service call mode to bypass JWT authentication
        customerData: {
          name: customerName,
          email: customerEmail,
          macAddress: macAddress,
          deviceType: deviceType,
          packageId: payload.customer?.package_id || payload.packageId || 'default',
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
      console.error('❌ Failed to create IPTV account:', error || data);
      return {
        success: false,
        message: 'Failed to create IPTV account',
        errors: [error?.message || 'Unknown error']
      };
    }

    // Consolidate the customer connections if multiple were created
    let consolidatedCustomer = null;
    if (data.customers?.length > 1) {
      console.log('🔄 Consolidating customer connections');
      const primaryCustomer = data.customers[0];
      const customerGroup = primaryCustomer.customer_group;
      
      const { data: consolidatedData } = await supabase.rpc('consolidate_customer_connections', {
        customer_group_name: customerGroup,
        reseller_id_param: resellerId
      });
      
      if (consolidatedData && consolidatedData.length > 0) {
        // Fetch the consolidated customer record
        const { data: consolidatedCustomerData } = await supabase
          .from('customers')
          .select('*')
          .eq('id', consolidatedData[0].consolidated_customer_id)
          .single();
        
        consolidatedCustomer = consolidatedCustomerData;
      }
    }

    // Send credentials via HighLevel if contact ID provided
    if (payload.contact_id) {
      const customersToSync = consolidatedCustomer ? [consolidatedCustomer] : data.customers;
      await syncCredentialsToHighLevel(
        payload.contact_id,
        customerName,
        customerEmail,
        customersToSync,
        resellerId,
        deviceType
      );
    }

    // Flatten credentials for HighLevel compatibility
    const customersForFlattening = consolidatedCustomer ? [consolidatedCustomer] : data.customers;
    const flattenedCredentials = flattenCustomerCredentials(customersForFlattening || []);

    return {
      success: true,
      message: `Consolidated account created successfully with ${connections} connection${connections > 1 ? 's' : ''}`,
      name: customerName,
      email: customerEmail,
      device_type: deviceType,
      start_date: startDate.toISOString().split('T')[0],
      end_date: expirationDate.toISOString().split('T')[0],
      account_type: accountType,
      credits_used: creditsRequired,
      ...flattenedCredentials
    };
  } catch (error) {
    console.error('💥 Error creating multi-connection account:', error);
    return {
      success: false,
      message: 'Internal error creating account',
      errors: [error.message]
    };
  }
}

// Enhanced group-aware renewal with flattened response
async function renewCustomerGroup(
  payload: EnhancedWebhookPayload,
  resellerId: string,
  resellerData: any
): Promise<WebhookResult> {
  try {
    console.log('🔄 Processing group renewal');
    
    const customerName = payload.customer?.name || payload.customerName || '';
    const customerEmail = payload.customer?.email || payload.customerEmail || '';
    const planDuration = payload.customer?.plan_duration_months || payload.planDuration || 1;
    
    if (!customerName || !customerEmail) {
      return {
        success: false,
        message: 'Missing required customer information for renewal',
        errors: ['missing_customer_data']
      };
    }
    
    // Find existing customer group
    const { data: existingCustomers, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('reseller_id', resellerId)
      .eq('name', customerName)
      .eq('email', customerEmail)
      .in('status', ['active', 'expired', 'expiring_soon'])
      .limit(1);

    if (findError || !existingCustomers || existingCustomers.length === 0) {
      return {
        success: false,
        message: `No customer found with name "${customerName}" and email "${customerEmail}"`,
        errors: ['customer_not_found']
      };
    }

    const primaryCustomer = existingCustomers[0];
    
    // Use the renew-customer-group function for group renewal
    const { data: renewalResult, error: renewalError } = await supabase.functions.invoke('renew-customer-group', {
      body: {
        customerId: primaryCustomer.id,
        planDuration: planDuration,
        resellerId: resellerId
      }
    });

    if (renewalError || !renewalResult?.success) {
      console.error('❌ Failed to renew customer group:', renewalError || renewalResult);
      return {
        success: false,
        message: renewalResult?.message || 'Failed to renew customer group',
        errors: [renewalError?.message || 'renewal_failed']
      };
    }

    // Send renewal confirmation via HighLevel if contact ID provided
    if (payload.contact_id) {
      await sendRenewalConfirmationToHighLevel(
        payload.contact_id,
        customerName,
        renewalResult.accountsRenewed,
        planDuration,
        resellerId
      );
    }

    // Calculate new end date
    const currentExpiry = new Date(primaryCustomer.expiration_date);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setMonth(newExpiry.getMonth() + planDuration);

    return {
      success: true,
      message: `Customer group renewed successfully. ${renewalResult.accountsRenewed} accounts renewed for ${planDuration} months`,
      name: customerName,
      email: customerEmail,
      device_type: primaryCustomer.device_type || 'Smart TV',
      start_date: primaryCustomer.start_date,
      end_date: newExpiry.toISOString().split('T')[0],
      account_type: primaryCustomer.mac_address ? 'mag' : 'm3u',
      accounts_renewed: renewalResult.accountsRenewed,
      credits_used: renewalResult.creditsUsed
    };
  } catch (error) {
    console.error('💥 Error renewing customer group:', error);
    return {
      success: false,
      message: 'Internal error during renewal',
      errors: [error.message]
    };
  }
}

// Enhanced function to sync consolidated credentials to HighLevel
async function syncCredentialsToHighLevel(
  contactId: string,
  customerName: string,
  customerEmail: string,
  customers: any[],
  resellerId: string,
  deviceType?: string
): Promise<void> {
  try {
    console.log(`📨 Syncing consolidated credentials to HighLevel contact: ${contactId}`);
    
    // First, create/update the contact with customer info and device type
    const { data: createContactResult, error: createContactError } = await supabase.functions.invoke('create-highlevel-contact', {
      body: {
        customerName,
        customerEmail,
        resellerId,
        deviceType,
        planDuration: customers[0]?.plan_duration || 1
      }
    });

    if (createContactError || !createContactResult?.success) {
      console.error('❌ Failed to create/update HighLevel contact:', createContactError || createContactResult);
      return;
    }

    // Prepare credentials for syncing - handle both consolidated and individual records
    const credentialsToSync: any = {};
    
    // If we have a consolidated customer with connection_list
    if (customers.length === 1 && customers[0].connection_list) {
      const connectionList = customers[0].connection_list;
      connectionList.slice(0, 3).forEach((connection: any, index: number) => {
        const fieldNumber = index + 1;
        
        if (connection.username) {
          credentialsToSync[`iptv_username_${fieldNumber}`] = connection.username;
        }
        
        if (connection.password) {
          credentialsToSync[`iptv_password_${fieldNumber}`] = connection.password;
        }
        
        if (connection.m3u_url) {
          credentialsToSync[`iptv_m3u_url_${fieldNumber}`] = connection.m3u_url;
        }
      });
    } else {
      // Handle individual customer records (legacy format)
      customers.slice(0, 3).forEach((customer, index) => {
        const fieldNumber = index + 1;
        
        if (customer.username) {
          credentialsToSync[`iptv_username_${fieldNumber}`] = customer.username;
        }
        
        if (customer.password) {
          credentialsToSync[`iptv_password_${fieldNumber}`] = customer.password;
        }
        
        if (customer.m3u_url) {
          credentialsToSync[`iptv_m3u_url_${fieldNumber}`] = customer.m3u_url;
        }
      });
    }

    console.log('🔐 Consolidated credentials to sync:', Object.keys(credentialsToSync));

    // Update the HighLevel contact with all credentials
    const { data: updateResult, error: updateError } = await supabase.functions.invoke('update-highlevel-contact-credentials', {
      body: {
        contactId,
        resellerId,
        iptvCredentials: credentialsToSync
      }
    });

    if (updateError || !updateResult?.success) {
      console.error('❌ Failed to update HighLevel contact credentials:', updateError || updateResult);
      return;
    }

    console.log('✅ Successfully synced consolidated credentials to HighLevel');

    // Send credentials via SMS/message as well
    await sendCredentialsMessage(contactId, customerName, customers, resellerId);
    
  } catch (error) {
    console.error('💥 Error syncing consolidated credentials to HighLevel:', error);
  }
}

// Send consolidated credentials message to HighLevel
async function sendCredentialsMessage(
  contactId: string,
  customerName: string,
  customers: any[],
  resellerId: string
): Promise<void> {
  try {
    console.log(`📱 Sending consolidated credentials message to HighLevel contact: ${contactId}`);
    
    // Get reseller's HighLevel credentials
    const { data: hlSettings, error: hlError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_api_key, location_id')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (hlError || !hlSettings) {
      console.log('⚠️ No HighLevel settings found for reseller:', resellerId);
      return;
    }

    // Format credentials message for consolidated structure
    let credentialsMessage = `🎬 Your IPTV Account Details:\n\n`;
    
    // Handle consolidated customer with connection_list
    if (customers.length === 1 && customers[0].connection_list) {
      const connectionList = customers[0].connection_list;
      const totalConnections = customers[0].total_connections || connectionList.length;
      
      credentialsMessage += `📊 Total Connections: ${totalConnections}\n\n`;
      
      connectionList.forEach((connection: any, index: number) => {
        if (connectionList.length > 1) {
          credentialsMessage += `Connection ${index + 1}:\n`;
        }
        credentialsMessage += `👤 Username: ${connection.username}\n`;
        credentialsMessage += `🔑 Password: ${connection.password}\n`;
        if (connection.m3u_url) {
          credentialsMessage += `📺 M3U URL: ${connection.m3u_url}\n`;
        }
        if (connectionList.length > 1) {
          credentialsMessage += `\n`;
        }
      });
    } else {
      // Handle individual customer records (legacy format)
      customers.forEach((customer, index) => {
        if (customers.length > 1) {
          credentialsMessage += `Connection ${index + 1}:\n`;
        }
        credentialsMessage += `👤 Username: ${customer.username}\n`;
        credentialsMessage += `🔑 Password: ${customer.password}\n`;
        if (customer.m3u_url) {
          credentialsMessage += `📺 M3U URL: ${customer.m3u_url}\n`;
        }
        if (customers.length > 1) {
          credentialsMessage += `\n`;
        }
      });
    }
    
    credentialsMessage += `\nThank you for your business!`;
    
    const { data, error } = await supabase.functions.invoke('send-highlevel-message', {
      body: {
        contactId: contactId,
        customerName: customerName,
        message: credentialsMessage,
        resellerId: resellerId,
        messageType: 'SMS',
        apiKey: hlSettings.location_api_key,
        locationId: hlSettings.location_id
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to send HighLevel message:', error || data);
    } else {
      console.log('✅ HighLevel consolidated credentials message sent successfully');
    }
  } catch (error) {
    console.error('💥 Error sending HighLevel consolidated credentials message:', error);
  }
}

// Send renewal confirmation to HighLevel
async function sendRenewalConfirmationToHighLevel(
  contactId: string,
  customerName: string,
  accountsRenewed: number,
  months: number,
  resellerId: string
): Promise<void> {
  try {
    console.log('📨 Sending renewal confirmation to HighLevel');
    
    const { data: hlSettings, error: hlError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_api_key, location_id')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (hlError || !hlSettings) {
      console.log('⚠️ No HighLevel settings found for reseller:', resellerId);
      return;
    }

    const message = `🔄 Account Renewal Confirmation\n\nHi ${customerName}!\n\nYour IPTV subscription has been successfully renewed:\n\n📊 Accounts Renewed: ${accountsRenewed}\n📅 Duration: ${months} month${months > 1 ? 's' : ''}\n\nYour service will continue without interruption. Thank you for your business!`;
    
    await supabase.functions.invoke('send-highlevel-message', {
      body: {
        contactId: contactId,
        customerName: customerName,
        message: message,
        resellerId: resellerId,
        messageType: 'SMS',
        apiKey: hlSettings.location_api_key,
        locationId: hlSettings.location_id
      }
    });
  } catch (error) {
    console.error('💥 Error sending renewal confirmation:', error);
  }
}

// Main enhanced webhook processor with flattened response
export const processEnhancedWebhook = async (payload: EnhancedWebhookPayload): Promise<WebhookResult> => {
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
