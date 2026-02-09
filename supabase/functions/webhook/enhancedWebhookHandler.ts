
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateHighLevelContact, getHighLevelSettings, HighLevelContactFields } from '../_shared/highlevel-api.ts';
import { rewriteM3uDomain, DEFAULT_M3U_DOMAIN } from '../_shared/m3u-domain.ts';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Helper to calculate expiration date, matching SQL interval behavior for month-end handling
function calculateNewExpirationDate(monthsToAdd: number): string {
  const now = new Date();
  const targetMonth = now.getMonth() + monthsToAdd;
  const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
  const actualMonth = ((targetMonth % 12) + 12) % 12; // Handle negative months correctly
  
  // Get the last day of the target month
  const lastDayOfTargetMonth = new Date(targetYear, actualMonth + 1, 0).getDate();
  
  // Use current day or last day of month if current day exceeds it
  const targetDay = Math.min(now.getDate(), lastDayOfTargetMonth);
  
  const result = new Date(targetYear, actualMonth, targetDay);
  return result.toISOString().split('T')[0];
}

// Helper to mask identifiers for sanitized logging
// MAC: show first 8 chars + ":xx:xx:xx" (e.g., "00:1A:2B:xx:xx:xx")
// Username: show first 2 + last 2 chars (or full if <= 4 chars)
function maskIdentifier(value: string | undefined, isMac: boolean): string {
  if (!value) return '[empty]';
  
  if (isMac) {
    if (value.length >= 8) {
      return value.substring(0, 8) + ':xx:xx:xx';
    }
    return value.substring(0, 2) + ':xx:xx:xx';
  } else {
    if (value.length <= 4) {
      return value;
    }
    return value.substring(0, 2) + '***' + value.substring(value.length - 2);
  }
}

// Helper to renew a single existing connection via Trex API
// Supports both M3U (username+password) and MAG (mac_address) accounts
// NEVER logs passwords, tokens, or m3u_url - only masked identifiers
async function renewConnectionViaTrex(
  connection: { username?: string; password?: string; mac_address?: string },
  planDurationMonths: number
): Promise<{ success: boolean; error?: string }> {
  const trexApiKey = Deno.env.get('TREX_API_KEY');
  const panelUrl = Deno.env.get('TREX_PANEL_URL') || 'https://activationpanel.net/api/api.php';

  if (!trexApiKey) {
    return { success: false, error: 'Trex API key not configured' };
  }

  // Map plan duration to subscription format
  const subMapping: { [key: number]: string } = { 1: '1', 3: '3', 6: '6', 12: '12', 24: '99' };
  const subscriptionPeriod = subMapping[planDurationMonths] || '1';

  const isMagAccount = !!connection.mac_address;
  const accountType = isMagAccount ? 'mag' : 'm3u';

  const renewUrl = new URL(panelUrl);
  renewUrl.searchParams.append('api_key', trexApiKey);
  renewUrl.searchParams.append('action', 'renew');
  renewUrl.searchParams.append('type', accountType);
  renewUrl.searchParams.append('sub', subscriptionPeriod);

  if (isMagAccount) {
    renewUrl.searchParams.append('mac', connection.mac_address!);
  } else {
    renewUrl.searchParams.append('username', connection.username || '');
    renewUrl.searchParams.append('password', connection.password || '');
  }

  try {
    // SANITIZED LOG - only log MASKED identifier
    const rawIdentifier = isMagAccount ? connection.mac_address : connection.username;
    const maskedIdentifier = maskIdentifier(rawIdentifier, isMagAccount);
    console.log(`📡 Trex renewal API call for ${accountType}: ${maskedIdentifier}`);
    
    const response = await fetch(renewUrl.toString());
    const responseText = await response.text();
    
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    // SANITIZED LOG - only safe metadata
    console.log(`📡 Trex renewal response for ${maskedIdentifier}:`, {
      httpStatus: response.status,
      hasError: !!data.error,
      hasMessage: !!data.message,
      status: data.status,
      success: data.success
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    if (data.error) {
      return { success: false, error: data.error };
    }

    // STRICT success check - only clear success indicators
    const isSuccess = data.status === 'true' || data.status === true || 
                      data.success === true || data.status === 'success';
    
    if (isSuccess) {
      console.log(`✅ Trex renewal succeeded for ${maskedIdentifier}`);
      return { success: true };
    }

    // Unclear response = FAILURE
    console.error(`❌ Trex renewal returned unclear response for ${maskedIdentifier}:`, {
      status: data.status, success: data.success, hasError: !!data.error
    });
    return { success: false, error: 'Trex renewal returned unclear response' };
    
  } catch (error) {
    console.error(`❌ Trex renewal exception:`, error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface EnhancedWebhookPayload {
  api_key?: string;
  resellerId?: string;
  contact_id?: string;
  action: 'create' | 'renew' | 'trial' | 'upgrade';
  connections?: number;
  is_trial?: boolean;
  trial_duration_hours?: number;
  plan_duration_months?: number; // Root-level for flexibility
  customer: {
    name: string;
    email: string;
    mac?: string;
    device_type?: string;
    plan_duration_months?: number;
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
      provider: 'trex', // Trex-only mode
      m3uDomainOverride: null
    };
  } catch (error) {
    console.error('💥 Error getting reseller by API key:', error);
    return null;
  }
}

// Sync provisioning result to HighLevel contact (NON-BLOCKING)
// Never logs tokens, passwords, or m3u_url
async function syncHighLevelContact(
  resellerId: string,
  contactId: string | undefined,
  success: boolean,
  credentialsList?: Array<{ username?: string; password?: string; m3u_url?: string }>,
  expirationDate?: string,
  errorMessage?: string,
  successTags?: string[]
): Promise<void> {
  if (!contactId) {
    console.log('⏭️ No contact_id provided, skipping HighLevel sync');
    return;
  }

  try {
    const hlSettings = await getHighLevelSettings(resellerId);
    
    if (!hlSettings) {
      console.log('⏭️ HighLevel not configured or inactive for reseller, skipping sync');
      return;
    }

    const fields: HighLevelContactFields = {
      provision_status: success ? 'success' : 'failed'
    };

    // Build per-connection fields (cap at 3)
    if (success && credentialsList && credentialsList.length > 0) {
      const maxConnections = Math.min(credentialsList.length, 3);
      fields.total_connections = String(maxConnections);
      
      // Connection 1
      if (credentialsList[0]) {
        fields.service_username_1 = credentialsList[0].username;
        fields.service_password_1 = credentialsList[0].password;
        fields.service_m3u_url_1 = credentialsList[0].m3u_url;
      }
      
      // Connection 2
      if (credentialsList[1]) {
        fields.service_username_2 = credentialsList[1].username;
        fields.service_password_2 = credentialsList[1].password;
        fields.service_m3u_url_2 = credentialsList[1].m3u_url;
      }
      
      // Connection 3
      if (credentialsList[2]) {
        fields.service_username_3 = credentialsList[2].username;
        fields.service_password_3 = credentialsList[2].password;
        fields.service_m3u_url_3 = credentialsList[2].m3u_url;
      }
    }

    if (success && expirationDate) {
      fields.service_expiration = expirationDate;
    }

    if (!success && errorMessage) {
      fields.provision_error = errorMessage;
    }

    // Add provision_failed tag on failure, or successTags (like trial_activated) on success
    let tagsToAdd: string[] | undefined = undefined;
    if (!success) {
      tagsToAdd = ['provision_failed'];
    } else if (successTags && successTags.length > 0) {
      tagsToAdd = successTags;
    }

    const result = await updateHighLevelContact(
      contactId,
      hlSettings.token,
      hlSettings.locationId,
      resellerId,
      fields,
      tagsToAdd
    );

    if (result.success) {
      console.log('✅ HighLevel contact synced successfully:', { contactId });
    } else {
      console.log('⚠️ HighLevel sync failed (non-blocking):', { contactId, error: result.error });
    }
  } catch (error) {
    // NON-BLOCKING - log and continue
    console.error('⚠️ HighLevel sync exception (non-blocking):', 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// Create trial account function (Trex only)
async function createTrialAccount(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerName: string, 
  provider: string,
  resellerData: any
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

      // Sync failure to HighLevel (non-blocking)
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        'Failed to create trial account'
      );

      return {
        success: false,
        message: 'Failed to create trial account',
        raw_api_response: data,
        errors: [error?.message || 'Unknown error']
      };
    }

    console.log('✅ Trial account created successfully');

    // Rewrite M3U URL for domain override (uses reseller's custom domain or platform default)
    const resellerM3uDomainOverride = resellerData?.m3uDomainOverride || null;
    const rewrittenM3uUrl = rewriteM3uDomain(
      data.customer?.m3uUrl,
      resellerM3uDomainOverride,
      DEFAULT_M3U_DOMAIN
    );
    console.log('🔗 M3U domain override applied:', !!resellerM3uDomainOverride);

    // Sync to HighLevel after successful trial provisioning (non-blocking)
    // Add trial_activated tag on success
    if (payload.contact_id && data.customer) {
      const credentialsList = [{
        username: data.customer.username,
        password: data.customer.password,
        m3u_url: rewrittenM3uUrl
      }];
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        true,
        credentialsList,
        expirationDate.toISOString().split('T')[0],
        undefined,
        ['trial_activated']
      );
    }

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
      m3u_url: rewrittenM3uUrl,
      username_1: data.customer?.username,
      password_1: data.customer?.password,
      m3u_url_1: rewrittenM3uUrl,
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

// Create consolidated multi-connection account function
async function createConsolidatedAccount(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerData: any
): Promise<EnhancedWebhookResult> {
  try {
    console.log('🔄 Creating consolidated multi-connection account');

    const connections = payload.connections || 1;
    const planDuration = payload.customer.plan_duration_months || 1;
    const creditsRequired = connections * planDuration;

    // Check credits
    if (resellerData.credits < creditsRequired) {
      // Sync failure to HighLevel (non-blocking)
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        `Insufficient credits. Required: ${creditsRequired}, Available: ${resellerData.credits}`
      );
      
      return {
        success: false,
        message: `Insufficient credits. Required: ${creditsRequired}, Available: ${resellerData.credits}`,
        errors: ['insufficient_credits']
      };
    }

    // Check if customer already exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('reseller_id', resellerId)
      .eq('name', payload.customer.name)
      .eq('email', payload.customer.email)
      .neq('status', 'cancelled')
      .single();

    if (existingCustomer) {
      return {
        success: false,
        message: `Customer ${payload.customer.name} already exists. Use renewal instead.`,
        errors: ['customer_already_exists']
      };
    }

    // Calculate dates
    const startDate = new Date();
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + planDuration);

    // Generate unique customer group ID
    const customerGroupId = `${payload.customer.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`;

    // Create individual connections using the create-iptv-user function
    const { data: createResult, error: createError } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        resellerId: resellerId,
        serviceCall: true,
        consolidate: false, // Don't auto-consolidate yet
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
          accountType: 'm3u',
          status: 'active',
          isDeactivated: false
        }
      }
    });

    if (createError || !createResult?.success) {
      console.error('❌ Failed to create connections:', createError || createResult);
      return {
        success: false,
        message: 'Failed to create connections',
        raw_api_response: createResult,
        errors: [createError?.message || 'Unknown error']
      };
    }

    // Now manually consolidate the created connections
    const connectionList = createResult.connectionList || [];
    
    // Rewrite M3U URLs for all connections (uses reseller's custom domain or platform default)
    const rewrittenConnectionDetails = connectionList.map((conn: any, index: number) => ({
      connection_number: index + 1,
      username: conn.username,
      password: conn.password,
      m3u_url: rewriteM3uDomain(conn.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN),
      status: 'active'
    }));
    console.log('🔗 M3U domain override applied:', !!resellerData.m3uDomainOverride);

    // Create the consolidated customer record
    const { data: consolidatedCustomer, error: consolidateError } = await supabase
      .from('customers')
      .insert([{
        reseller_id: resellerId,
        name: payload.customer.name,
        email: payload.customer.email,
        mac_address: payload.customer.mac || null,
        device_type: payload.customer.device_type || 'Smart TV',
        plan_duration: planDuration,
        max_connections: connections,
        total_connections: connections,
        current_connections: 0,
        connection_details: rewrittenConnectionDetails,
        connection_list: rewrittenConnectionDetails,
        start_date: startDate.toISOString().split('T')[0],
        expiration_date: expirationDate.toISOString().split('T')[0],
        status: 'active',
        is_deactivated: false,
        provider: 'trex', // Trex-only mode
        customer_group: customerGroupId,
        customer_group_id: null,
        highlevel_contact_id: payload.contact_id
      }])
      .select()
      .single();

    if (consolidateError) {
      console.error('❌ Failed to create consolidated customer:', consolidateError);
      return {
        success: false,
        message: 'Failed to create consolidated customer record',
        errors: [consolidateError.message]
      };
    }

    // Delete the individual connection records created by create-iptv-user
    if (createResult.customers && createResult.customers.length > 0) {
      const customerIds = createResult.customers.map((c: any) => c.id);
      await supabase
        .from('customers')
        .delete()
        .in('id', customerIds);
    }

    console.log('✅ Consolidated account created successfully');

    // Prepare response with individual credentials for HighLevel compatibility
    const response: EnhancedWebhookResult = {
      success: true,
      message: `Consolidated account created successfully with ${connections} connection${connections > 1 ? 's' : ''}`,
      name: payload.customer.name,
      email: payload.customer.email,
      device_type: payload.customer.device_type || 'Smart TV',
      start_date: startDate.toISOString().split('T')[0],
      end_date: expirationDate.toISOString().split('T')[0],
      account_type: 'm3u',
      credits_used: creditsRequired,
      total_connections: connections,
      credentials: rewrittenConnectionDetails,
      raw_api_response: createResult
    };

    // Add individual credential fields for backwards compatibility
    rewrittenConnectionDetails.forEach((cred: any, index: number) => {
      const num = index + 1;
      response[`username_${num}` as keyof EnhancedWebhookResult] = cred.username;
      response[`password_${num}` as keyof EnhancedWebhookResult] = cred.password;
      response[`m3u_url_${num}` as keyof EnhancedWebhookResult] = cred.m3u_url;
    });

    // Set primary credentials to first connection
    if (rewrittenConnectionDetails.length > 0) {
      response.username = rewrittenConnectionDetails[0].username;
      response.password = rewrittenConnectionDetails[0].password;
      response.m3u_url = rewrittenConnectionDetails[0].m3u_url;
    }

    // Sync to HighLevel after successful provisioning (non-blocking)
    // Pass FULL credentials list (up to 3)
    if (payload.contact_id) {
      const expirationDateStr = expirationDate.toISOString().split('T')[0];
      const credentialsList = rewrittenConnectionDetails.slice(0, 3).map((cred: any) => ({
        username: cred.username,
        password: cred.password,
        m3u_url: cred.m3u_url
      }));
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        true,
        credentialsList,
        expirationDateStr
      );
    }

    return response;
  } catch (error) {
    console.error('💥 Error creating consolidated account:', error);
    return {
      success: false,
      message: 'Internal error creating consolidated account',
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

    // Find existing customer - priority: contact_id lookup, then name+email fallback
    let customer: any = null;

    // 1. First try to find by highlevel_contact_id if contact_id is provided
    if (payload.contact_id) {
      console.log(`🔍 Looking up customer by highlevel_contact_id: ${payload.contact_id}`);
      const { data: contactCustomers, error: contactError } = await supabase
        .from('customers')
        .select('*')
        .eq('reseller_id', resellerId)
        .eq('highlevel_contact_id', payload.contact_id)
        .in('status', ['active', 'expired', 'expiring_soon'])
        .limit(1);

      if (!contactError && contactCustomers && contactCustomers.length > 0) {
        customer = contactCustomers[0];
        console.log(`✅ Found customer by highlevel_contact_id: ${customer.name}`);
      } else {
        console.log('⏭️ No customer found by highlevel_contact_id, trying name+email fallback');
      }
    }

    // 2. Fallback to name + email lookup if not found by contact_id
    if (!customer && payload.customer.name && payload.customer.email) {
      console.log(`🔍 Looking up customer by name+email: ${payload.customer.name} / ${payload.customer.email}`);
      const { data: nameEmailCustomers, error: findError } = await supabase
        .from('customers')
        .select('*')
        .eq('reseller_id', resellerId)
        .eq('name', payload.customer.name)
        .eq('email', payload.customer.email)
        .in('status', ['active', 'expired', 'expiring_soon'])
        .limit(1);

      if (!findError && nameEmailCustomers && nameEmailCustomers.length > 0) {
        customer = nameEmailCustomers[0];
        console.log(`✅ Found customer by name+email: ${customer.name}`);
      }
    }

    // 3. If still not found, return error
    if (!customer) {
      const errorMsg = payload.contact_id 
        ? `No customer found matching contact_id "${payload.contact_id}" or name/email provided`
        : `No customer found with name "${payload.customer.name}" and email "${payload.customer.email}"`;
      
      // Sync failure to HighLevel (non-blocking)
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        errorMsg
      );
      
      return {
        success: false,
        message: errorMsg,
        errors: ['customer_not_found']
      };
    }

    // Persist contact_id if provided via webhook (link HighLevel contact to customer)
    if (payload.contact_id && customer.id && customer.highlevel_contact_id !== payload.contact_id) {
      await supabase
        .from('customers')
        .update({ highlevel_contact_id: payload.contact_id })
        .eq('id', customer.id);
      console.log(`🔗 Linked highlevel_contact_id to customer: ${payload.contact_id}`);
    }

    // Use the renew-customer-group function with service call pattern
    const { data, error } = await supabase.functions.invoke('renew-customer-group', {
      body: {
        customerId: customer.id,
        planDuration: planDuration,
        serviceCall: true,  // Bypass JWT verification - webhook already validated API key
        resellerId: resellerId
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to renew customer:', error || data);
      
      // Sync failure to HighLevel (non-blocking)
      const contactIdToUse = payload.contact_id || customer.highlevel_contact_id;
      await syncHighLevelContact(
        resellerId,
        contactIdToUse,
        false,
        undefined,
        undefined,
        data?.message || 'Failed to renew customer'
      );
      
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

    // Sync to HighLevel after successful renewal (non-blocking)
    // Build credentials list from connection_list or legacy fields WITH domain rewrite
    const contactIdToUse = payload.contact_id || customer.highlevel_contact_id;
    if (contactIdToUse) {
      let credentialsList: Array<{ username?: string; password?: string; m3u_url?: string }> = [];
      
      if (customer.connection_list && Array.isArray(customer.connection_list) && customer.connection_list.length > 0) {
        // Use connection_list (up to 3) with domain rewrite
        credentialsList = customer.connection_list.slice(0, 3).map((conn: any) => ({
          username: conn.username,
          password: conn.password,
          m3u_url: rewriteM3uDomain(conn.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN)
        }));
      } else if (customer.username || customer.password) {
        // Legacy single-connection fallback with domain rewrite
        credentialsList = [{
          username: customer.username,
          password: customer.password,
          m3u_url: rewriteM3uDomain(customer.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN)
        }];
      }
      
      console.log('🔗 M3U domain override applied for renewal:', !!resellerData.m3uDomainOverride);
      
      // Add renewal_success tag on successful renewal
      await syncHighLevelContact(
        resellerId,
        contactIdToUse,
        true,
        credentialsList,
        newExpiry.toISOString().split('T')[0],
        undefined,
        ['renewal_success']
      );
    }

    // Trigger post-renewal sync to fetch authoritative dates from provider (non-blocking safety net)
    try {
      console.log('🔄 Triggering post-renewal sync for customer:', customer.id);
      await supabase.functions.invoke('sync-device-info', {
        body: { customerId: customer.id }
      });
      console.log('✅ Post-renewal sync triggered successfully');
    } catch (syncError) {
      console.log('⚠️ Post-renewal sync failed (non-blocking):', syncError instanceof Error ? syncError.message : 'Unknown error');
    }

    return {
      success: true,
      message: `Customer renewed successfully. ${data.accountsRenewed} accounts renewed for ${planDuration} months`,
      name: customer.name,
      email: customer.email,
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

// Upgrade customer connections function (increase from N to M connections, max 3)
async function upgradeCustomerConnections(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerData: any
): Promise<EnhancedWebhookResult> {
  try {
    console.log('⬆️ Upgrading customer connections');

    // 1. Extract plan_duration_months (REQUIRED)
    const planDurationMonths = payload.customer.plan_duration_months || payload.plan_duration_months;
    if (!planDurationMonths || planDurationMonths < 1) {
      console.log('❌ Missing or invalid plan_duration_months');
      
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        'Missing plan_duration_months in upgrade request'
      );
      
      return {
        success: false,
        message: 'Missing plan_duration_months. Required for upgrade billing calculation.',
        errors: ['missing_plan_duration']
      };
    }

    // 2. Validate requested connections (must be 2 or 3)
    const requestedConnections = payload.connections || 1;
    if (requestedConnections < 1 || requestedConnections > 3) {
      console.log(`❌ Invalid requested connections: ${requestedConnections}`);
      
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        `Invalid connections: ${requestedConnections}. Must be 1-3.`
      );
      
      return {
        success: false,
        message: `Invalid connections: ${requestedConnections}. Must be between 1 and 3.`,
        errors: ['invalid_connections']
      };
    }

    // 3. Find existing customer - priority: contact_id lookup, then name+email fallback
    let customer: any = null;

    // 3a. First try to find by highlevel_contact_id if contact_id is provided
    if (payload.contact_id) {
      console.log(`🔍 Looking up customer by highlevel_contact_id: ${payload.contact_id}`);
      const { data: contactCustomers, error: contactError } = await supabase
        .from('customers')
        .select('*')
        .eq('reseller_id', resellerId)
        .eq('highlevel_contact_id', payload.contact_id)
        .in('status', ['active', 'expired', 'expiring_soon'])
        .limit(1);

      if (!contactError && contactCustomers && contactCustomers.length > 0) {
        customer = contactCustomers[0];
        console.log(`✅ Found customer by highlevel_contact_id: ${customer.name}`);
      } else {
        console.log('⏭️ No customer found by highlevel_contact_id, trying name+email fallback');
      }
    }

    // 3b. Fallback to name + email lookup if not found by contact_id
    if (!customer && payload.customer.name && payload.customer.email) {
      console.log(`🔍 Looking up customer by name+email: ${payload.customer.name} / ${payload.customer.email}`);
      const { data: nameEmailCustomers, error: findError } = await supabase
        .from('customers')
        .select('*')
        .eq('reseller_id', resellerId)
        .eq('name', payload.customer.name)
        .eq('email', payload.customer.email)
        .in('status', ['active', 'expired', 'expiring_soon'])
        .limit(1);

      if (!findError && nameEmailCustomers && nameEmailCustomers.length > 0) {
        customer = nameEmailCustomers[0];
        console.log(`✅ Found customer by name+email: ${customer.name}`);
      }
    }

    // 3c. If still not found, return error
    if (!customer) {
      const errorMsg = payload.contact_id 
        ? `No customer found matching contact_id "${payload.contact_id}" or name/email provided`
        : `No customer found with name "${payload.customer.name}" and email "${payload.customer.email}"`;
      
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        errorMsg
      );
      
      return {
        success: false,
        message: errorMsg,
        errors: ['customer_not_found']
      };
    }

    // 4. Persist contact_id if provided but customer lacks it
    if (payload.contact_id && customer.id && customer.highlevel_contact_id !== payload.contact_id) {
      await supabase
        .from('customers')
        .update({ highlevel_contact_id: payload.contact_id })
        .eq('id', customer.id);
      console.log(`🔗 Linked highlevel_contact_id to customer: ${payload.contact_id}`);
    }

    // 5. Determine current connection count
    let currentConnections = 0;
    let existingConnectionList: any[] = [];

    if (customer.connection_list && Array.isArray(customer.connection_list) && customer.connection_list.length > 0) {
      currentConnections = customer.connection_list.length;
      existingConnectionList = [...customer.connection_list];
      console.log(`📊 Current connections (from connection_list): ${currentConnections}`);
    } else if (customer.total_connections && customer.total_connections > 0) {
      currentConnections = customer.total_connections;
      console.log(`📊 Current connections (from total_connections): ${currentConnections}`);
    } else if (customer.username) {
      // Legacy single-connection customer
      currentConnections = 1;
      console.log(`📊 Current connections (legacy single): ${currentConnections}`);
    }

    if (currentConnections === 0) {
      console.log('❌ Could not determine current connection count');
      return {
        success: false,
        message: 'Unable to determine current connection count for customer',
        errors: ['upgrade_failed']
      };
    }

    // 6. Validate upgrade is possible
    if (requestedConnections <= currentConnections) {
      console.log(`⚠️ No upgrade needed: requested=${requestedConnections}, current=${currentConnections}`);
      return {
        success: false,
        message: `Customer already has ${currentConnections} connection(s). No upgrade needed. Use 'renew' to extend subscription.`,
        errors: ['no_upgrade_needed']
      };
    }

    // 7. Calculate delta and credits required (upgrade = renew + add, so charge for ALL connections)
    const delta = requestedConnections - currentConnections;
    const creditsRequired = requestedConnections * planDurationMonths;
    console.log(`💰 Credits calculation: connections=${requestedConnections} × duration=${planDurationMonths} = ${creditsRequired} credits (upgrade+renew)`);

    // 8. Check reseller credits
    if (resellerData.credits < creditsRequired) {
      const errorMsg = `Insufficient credits. Required: ${creditsRequired}, Available: ${resellerData.credits}`;
      console.log(`❌ ${errorMsg}`);
      
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        errorMsg
      );
      
      return {
        success: false,
        message: errorMsg,
        errors: ['insufficient_credits']
      };
    }

    // Calculate unified expiration date for all connections (upgrade = renew + add)
    const newExpirationDateStr = calculateNewExpirationDate(planDurationMonths);
    console.log(`📅 Unified expiration date: ${newExpirationDateStr} (now + ${planDurationMonths} months)`);

    // 9. Migrate primary connection if connection_list is empty
    if (existingConnectionList.length === 0 && customer.username && customer.password) {
      console.log('📦 Migrating primary connection to connection_list');
      existingConnectionList.push({
        connection_number: 1,
        username: customer.username,
        password: customer.password,
        mac_address: customer.mac_address || null,
        m3u_url: customer.m3u_url,
        expiration_date: customer.expiration_date,
        status: 'active'
      });
    }

    // 10. RENEW EXISTING CONNECTIONS VIA TREX API (provider-side renewal)
    console.log(`🔄 Renewing ${existingConnectionList.length} existing connection(s) via Trex API...`);

    for (let i = 0; i < existingConnectionList.length; i++) {
      const conn = existingConnectionList[i];
      const connNum = conn.connection_number || i + 1;
      
      console.log(`📡 Renewing existing connection ${connNum}/${existingConnectionList.length}...`);
      
      const renewResult = await renewConnectionViaTrex(
        {
          username: conn.username,
          password: conn.password,
          mac_address: conn.mac_address
        },
        planDurationMonths
      );
      
      if (!renewResult.success) {
        const errorMsg = `Failed to renew existing connection ${connNum}: ${renewResult.error}`;
        console.error(`❌ ${errorMsg}`);
        
        await syncHighLevelContact(
          resellerId,
          payload.contact_id,
          false,
          undefined,
          undefined,
          errorMsg
        );
        
        return {
          success: false,
          message: errorMsg,
          errors: ['upgrade_failed']
        };
      }
      
      // Update local expiration AFTER successful API renewal
      existingConnectionList[i] = {
        ...conn,
        expiration_date: newExpirationDateStr
      };
      
      console.log(`✅ Connection ${connNum} renewed and expiration updated to ${newExpirationDateStr}`);
    }

    console.log(`✅ All ${existingConnectionList.length} existing connection(s) renewed via Trex API`);

    // 11. Create additional connections (delta) using create-iptv-user
    const newConnections: any[] = [];
    const deviceType = customer.device_type || payload.customer?.device_type || 'Smart TV';

    // Get package ID - prioritize customer's existing package, then payload, then lookup from system settings
    let packageId = customer.package_id || payload.customer?.package_id;
    if (!packageId) {
      const { data: packageSetting, error: packageSettingError } = await supabase
        .from('system_settings')
        .select('value')
        .eq('id', 'trex_default_package_id')
        .single();
      
      if (packageSettingError) {
        console.log('⚠️ Could not load trex_default_package_id from system_settings (using fallback)');
      }
      
      packageId = packageSetting?.value || '27228';
      console.log(`📦 Using default Trex package ID: ${String(packageId)}`);
    }

    for (let i = 0; i < delta; i++) {
      const connectionNumber = existingConnectionList.length + newConnections.length + 1;
      console.log(`🔧 Creating connection ${connectionNumber} of ${requestedConnections}`);

      const { data: createResult, error: createError } = await supabase.functions.invoke('create-iptv-user', {
        body: {
          resellerId: resellerId,
          serviceCall: true,
          skipCredits: true, // We handle credits manually for upgrade
          customerData: {
            name: customer.name,
            email: customer.email,
            macAddress: null, // M3U connections don't need MAC
            deviceType: deviceType,
            packageId: packageId,
            planDuration: planDurationMonths,
            connections: 1, // Create one at a time
            maxConnections: 1,
            startDate: new Date().toISOString().split('T')[0],
            expirationDate: newExpirationDateStr, // Use unified new expiration
            accountType: 'm3u',
            status: 'active',
            isDeactivated: false
          }
        }
      });

      if (createError || !createResult?.success) {
        console.error(`❌ Failed to create connection ${connectionNumber}:`, createError || createResult);
        
        // Partial failure - we created some but not all
        if (newConnections.length > 0) {
          console.log(`⚠️ Partial upgrade: created ${newConnections.length} of ${delta} connections`);
        }
        
        await syncHighLevelContact(
          resellerId,
          payload.contact_id,
          false,
          undefined,
          undefined,
          `Failed to create connection ${connectionNumber}: ${createResult?.message || createError?.message || 'Unknown error'}`
        );
        
        return {
          success: false,
          message: `Failed to create connection ${connectionNumber}. ${newConnections.length} connection(s) were created before failure.`,
          errors: ['upgrade_failed']
        };
      }

      // Extract credentials from response
      const createdCreds = createResult.connectionList?.[0] || createResult.customer || {};
      newConnections.push({
        connection_number: connectionNumber,
        username: createdCreds.username,
        password: createdCreds.password,
        m3u_url: createdCreds.m3u_url,
        expiration_date: newExpirationDateStr, // Use unified new expiration
        status: 'active'
      });

      // Clean up the individual customer record created by create-iptv-user
      if (createResult.customers && createResult.customers.length > 0) {
        const customerIds = createResult.customers.map((c: any) => c.id);
        await supabase.from('customers').delete().in('id', customerIds);
      } else if (createResult.customer?.id) {
        await supabase.from('customers').delete().eq('id', createResult.customer.id);
      }

      console.log(`✅ Connection ${connectionNumber} created successfully`);
    }

    // 12. Rewrite M3U URLs for persistence and downstream use
    const updatedConnectionList = [...existingConnectionList, ...newConnections];
    const rewrittenConnectionList = updatedConnectionList.map((conn: any) => ({
      ...conn,
      m3u_url: rewriteM3uDomain(conn.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN)
    }));
    console.log('🔗 M3U domain override applied for upgrade:', !!resellerData.m3uDomainOverride);
    
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        connection_list: rewrittenConnectionList,
        total_connections: requestedConnections,
        max_connections: requestedConnections,
        expiration_date: newExpirationDateStr,
        plan_duration: planDurationMonths
      })
      .eq('id', customer.id);

    if (updateError) {
      console.error('❌ Failed to update customer record:', updateError);
      return {
        success: false,
        message: 'Failed to update customer record with new connections',
        errors: ['upgrade_failed']
      };
    }

    // 13. Deduct credits from reseller
    const { error: creditError } = await supabase
      .from('profiles')
      .update({ credits: resellerData.credits - creditsRequired })
      .eq('id', resellerId);

    if (creditError) {
      console.error('⚠️ Failed to deduct credits (non-blocking):', creditError);
    }

    // 14. Log credit usage
    await supabase.from('credit_logs').insert([{
      reseller_id: resellerId,
      action: 'account_creation',
      credits_used: creditsRequired,
      customer_id: customer.id,
      customer_name: customer.name,
      notes: `Upgrade+Renew: ${currentConnections} → ${requestedConnections} connections for ${planDurationMonths} months`
    }]);

    console.log(`✅ Upgrade completed: ${currentConnections} → ${requestedConnections} connections, ${creditsRequired} credits used`);

    // 15. Sync to HighLevel (non-blocking) - use rewritten URLs
    const contactIdToUse = payload.contact_id || customer.highlevel_contact_id;
    if (contactIdToUse) {
      const credentialsList = rewrittenConnectionList.slice(0, 3).map((conn: any) => ({
        username: conn.username,
        password: conn.password,
        m3u_url: conn.m3u_url
      }));
      
      // Use new unified expiration (upgrade = renew + add)
      await syncHighLevelContact(
        resellerId,
        contactIdToUse,
        true,
        credentialsList,
        newExpirationDateStr,
        undefined,
        ['upgrade_success']
      );
    }

    // 16. Build response with all credentials (use rewritten URLs)
    const response: EnhancedWebhookResult = {
      success: true,
      message: `Upgraded from ${currentConnections} to ${requestedConnections} connections`,
      name: customer.name,
      email: customer.email,
      device_type: customer.device_type || 'Smart TV',
      start_date: customer.start_date,
      end_date: newExpirationDateStr, // New unified expiration
      account_type: 'm3u',
      credits_used: creditsRequired,
      total_connections: requestedConnections,
      credentials: rewrittenConnectionList
    };

    // Add individual credential fields for backwards compatibility (up to 3)
    rewrittenConnectionList.slice(0, 3).forEach((cred: any, index: number) => {
      const num = index + 1;
      response[`username_${num}` as keyof EnhancedWebhookResult] = cred.username;
      response[`password_${num}` as keyof EnhancedWebhookResult] = cred.password;
      response[`m3u_url_${num}` as keyof EnhancedWebhookResult] = cred.m3u_url;
    });

    // Set primary credentials to first connection
    if (rewrittenConnectionList.length > 0) {
      response.username = rewrittenConnectionList[0].username;
      response.password = rewrittenConnectionList[0].password;
      response.m3u_url = rewrittenConnectionList[0].m3u_url;
    }

    return response;
  } catch (error) {
    console.error('💥 Error upgrading customer:', error);
    return {
      success: false,
      message: 'Internal error during upgrade',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

export const processEnhancedWebhook = async (payload: EnhancedWebhookPayload): Promise<EnhancedWebhookResult> => {
  try {
    console.log('🚀 Processing enhanced webhook payload with consolidated multi-connection support:', JSON.stringify(payload, null, 2));
    
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
        provider: reseller.provider || 'trex',
        m3uDomainOverride: null
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
        return await createTrialAccount(payload, resellerData.resellerId, resellerData.name, resellerData.provider, resellerData);
      
      case 'create':
        return await createConsolidatedAccount(payload, resellerData.resellerId, resellerData);
      
      case 'renew':
        return await renewCustomerGroup(payload, resellerData.resellerId, resellerData);
      
      case 'upgrade':
        return await upgradeCustomerConnections(payload, resellerData.resellerId, resellerData);
      
      default:
        return {
          success: false,
          message: `Unsupported action: ${payload.action}. Supported actions: create, renew, trial, upgrade`,
          errors: ['unsupported_action']
        };
    }
  } catch (error) {
    console.error('💥 Fatal error processing enhanced webhook:', error);
    return {
      success: false,
      message: 'Internal server error processing webhook',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
};
