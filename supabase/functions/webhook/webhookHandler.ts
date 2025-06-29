import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export interface Customer {
  id?: string;
  resellerId: string;
  name: string;
  email: string;
  macAddress: string;
  deviceType: string;
  planDuration: number;
  startDate: string;
  expirationDate: string;
  createdAt?: string;
  username?: string;
  password?: string;
}

// Define webhook payload structure to match HighLevel format
export interface WebhookPayload {
  // API key for reseller identification
  api_key?: string;
  // Legacy reseller ID for backwards compatibility
  resellerId?: string;
  // HighLevel contact ID for sending credentials
  contact_id?: string;
  // Action type to differentiate between create and renew
  action?: 'create' | 'renew';
  // Trial account flag
  is_trial?: boolean;
  customer?: {
    name: string;
    email: string;
    mac?: string; // Optional for renewals
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
  packageId?: string; // Optional package ID for legacy format
  contactId?: string; // Legacy support for contact ID
}

// Flattened webhook result for HighLevel compatibility
interface LegacyWebhookResult {
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

// Generate IPTV credentials
function generateUsername(customerName: string): string {
  const cleanName = customerName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().substring(0, 10);
  const randomSuffix = Math.floor(Math.random() * 1000);
  return `${cleanName}${randomSuffix}`;
}

function generatePassword(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Get default package ID from system settings
async function getDefaultPackageId(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('id', 'default_package_id')
      .single();

    if (error || !data) {
      console.log('⚠️ Default package ID not found in system settings, using fallback value "14826"');
      return '14826'; // Fallback to package ID "14826"
    }

    console.log(`📦 Using default package ID from settings: ${data.value}`);
    return data.value;
  } catch (error) {
    console.error('❌ Error fetching default package ID:', error);
    return '14826'; // Fallback to package ID "14826"
  }
}

// Get reseller's HighLevel credentials
async function getResellerHighLevelCredentials(resellerId: string): Promise<{
  apiKey: string | null;
  locationId: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_api_key, location_id')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.log('⚠️ No HighLevel settings found for reseller:', resellerId);
      return { apiKey: null, locationId: null };
    }

    console.log('✅ Found HighLevel credentials for reseller:', resellerId);
    return { apiKey: data.location_api_key, locationId: data.location_id };
  } catch (error) {
    console.error('❌ Error fetching HighLevel credentials:', error);
    return { apiKey: null, locationId: null };
  }
}

// Find existing customer by name and email
async function findCustomerByNameAndEmail(
  customerName: string,
  customerEmail: string,
  resellerId: string
): Promise<any | null> {
  try {
    console.log(`🔍 Looking for existing customer: ${customerName} (${customerEmail}) for reseller: ${resellerId}`);
    
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .eq('reseller_id', resellerId)
      .eq('name', customerName)
      .eq('email', customerEmail)
      .in('status', ['active', 'expired', 'expiring_soon']) // Include expired customers that can be renewed
      .limit(1);

    if (error) {
      console.error('❌ Error searching for customer:', error);
      return null;
    }

    if (!customers || customers.length === 0) {
      console.log('⚠️ No matching customer found');
      return null;
    }

    const customer = customers[0];
    console.log(`✅ Found matching customer: ${customer.id}`);
    return customer;
  } catch (error) {
    console.error('💥 Error in findCustomerByNameAndEmail:', error);
    return null;
  }
}

// Process customer renewal with flattened response
async function processCustomerRenewal(
  customer: any,
  additionalMonths: number,
  resellerId: string,
  contactId?: string
): Promise<LegacyWebhookResult> {
  try {
    console.log(`🔄 Processing renewal for customer: ${customer.id} (${additionalMonths} months)`);

    // Check if reseller has enough credits
    const { data: reseller, error: resellerError } = await supabase
      .from('profiles')
      .select('credits, name')
      .eq('id', resellerId)
      .single();

    if (resellerError || !reseller) {
      console.error('❌ Error fetching reseller data:', resellerError);
      return {
        success: false,
        message: `Reseller not found: ${resellerError?.message || 'Unknown error'}`,
        errors: ['reseller_not_found']
      };
    }

    if (reseller.credits < additionalMonths) {
      console.error('❌ Insufficient credits for renewal');
      return {
        success: false,
        message: `Insufficient credits: Reseller has ${reseller.credits} credits, but ${additionalMonths} are required`,
        errors: ['insufficient_credits']
      };
    }

    // Call IPTV panel renewal API
    console.log('🎯 Calling IPTV panel renewal API');
    const { data, error } = await supabase.functions.invoke('renew-iptv-user', {
      body: {
        customerId: customer.id,
        additionalMonths
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to renew IPTV user:', error || data);
      return {
        success: false,
        message: "Failed to renew IPTV user in panel",
        errors: ['renewal_api_failed']
      };
    }

    console.log('✅ IPTV user renewed successfully');

    // Calculate new expiration date
    const currentExpiry = new Date(customer.expiration_date);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setMonth(newExpiry.getMonth() + additionalMonths);
    const newExpirationDate = newExpiry.toISOString().split('T')[0];

    console.log(`📅 New expiration date: ${newExpirationDate}`);

    // Update customer record in database
    const { error: updateError } = await supabase
      .from('customers')
      .update({ 
        expiration_date: newExpirationDate,
        is_deactivated: false, // Reactivate if deactivated
        status: 'active' // Set status back to active
      })
      .eq('id', customer.id);

    if (updateError) {
      console.error('❌ Error updating customer record:', updateError);
      return {
        success: false,
        message: `Failed to update customer record: ${updateError.message}`,
        errors: ['database_update_failed']
      };
    }

    console.log('✅ Customer record updated successfully');

    // Deduct credits from reseller
    const { error: creditError } = await supabase
      .from('profiles')
      .update({ credits: reseller.credits - additionalMonths })
      .eq('id', resellerId);

    if (creditError) {
      console.error('❌ Error deducting credits:', creditError);
      return {
        success: false,
        message: `Failed to deduct credits: ${creditError.message}`,
        errors: ['credit_deduction_failed']
      };
    }

    console.log('💳 Credits deducted successfully');

    // Log the transaction
    const { error: logError } = await supabase
      .from('credit_logs')
      .insert({
        reseller_id: resellerId,
        action: 'deduction',
        credits_used: additionalMonths,
        customer_id: customer.id,
        customer_name: customer.name,
        notes: `${additionalMonths} month renewal via webhook - Customer: ${customer.username}`
      });

    if (logError) {
      console.error('⚠️ Failed to log renewal transaction:', logError);
    }

    // Send renewal confirmation via HighLevel if contact ID is available
    if (contactId || customer.highlevel_contact_id) {
      const finalContactId = contactId || customer.highlevel_contact_id;
      console.log('📨 Sending renewal confirmation via HighLevel');
      
      await sendHighLevelCredentials(
        finalContactId,
        customer.name,
        customer.username || '',
        customer.password || '',
        resellerId,
        customer.m3u_url
      );
    }

    console.log('🎉 Customer renewal completed successfully');

    // Return flattened response for HighLevel compatibility
    return {
      success: true,
      message: `Customer ${customer.name} renewed successfully for ${additionalMonths} months`,
      name: customer.name,
      email: customer.email,
      device_type: customer.device_type || 'Unknown',
      start_date: customer.start_date,
      end_date: newExpirationDate,
      account_type: customer.mac_address ? 'mag' : 'm3u',
      username: customer.username,
      password: customer.password,
      m3u_url: customer.m3u_url,
      credits_used: additionalMonths
    };
  } catch (error) {
    console.error('💥 Error in processCustomerRenewal:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error during renewal",
      errors: ['unknown_error']
    };
  }
}

// Enhanced HighLevel contact sync with multi-credential support
async function syncContactWithMultiCredentials(
  contactId: string,
  customerData: any,
  resellerId: string,
  customers: any[]
): Promise<void> {
  try {
    console.log('🔄 Syncing contact with multi-credential support:', contactId);

    // Prepare credentials for syncing (up to 3 sets)
    const credentialsToSync: any = {};
    
    // Map first 3 customer accounts to custom fields
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

    // Add device type and other data
    if (customerData.deviceType) {
      credentialsToSync['device_type_optional'] = customerData.deviceType;
    }

    console.log('🔐 Credentials to sync:', Object.keys(credentialsToSync));

    // First create/update the contact with basic info
    const { data: createContactResult, error: createContactError } = await supabase.functions.invoke('create-highlevel-contact', {
      body: {
        customerName: customerData.name,
        customerEmail: customerData.email,
        resellerId: resellerId,
        iptvCredentials: credentialsToSync,
        deviceType: customerData.deviceType,
        planDuration: customerData.planDuration
      }
    });

    if (createContactError || !createContactResult?.success) {
      console.error('❌ Failed to create/update HighLevel contact:', createContactError || createContactResult);
      return;
    }

    console.log('✅ Successfully synced contact with multi-credentials');
    
  } catch (error) {
    console.error('💥 Error syncing contact with multi-credentials:', error);
  }
}

// Send credentials via HighLevel (if contact ID is provided and credentials are available)
async function sendHighLevelCredentials(
  contactId: string,
  customerName: string,
  username: string,
  password: string,
  resellerId: string,
  m3uUrl?: string
): Promise<void> {
  try {
    console.log('📨 Attempting to send credentials via HighLevel to contact:', contactId);

    // Get reseller's HighLevel credentials
    const { apiKey, locationId } = await getResellerHighLevelCredentials(resellerId);

    if (!apiKey || !locationId) {
      console.log('⚠️ No HighLevel credentials configured for reseller:', resellerId);
      return;
    }

    console.log('✅ Found HighLevel credentials for reseller, sending message');

    const { data, error } = await supabase.functions.invoke('send-highlevel-message', {
      body: {
        contactId,
        customerName,
        username,
        password,
        m3uUrl,
        resellerId,
        messageType: 'SMS',
        apiKey,  // Pass reseller's API key
        locationId  // Pass reseller's location ID
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to send HighLevel message:', error || data);
    } else {
      console.log('✅ HighLevel credentials sent successfully:', data);
    }
  } catch (error) {
    console.error('💥 Error sending HighLevel credentials:', error);
  }
}

// Process incoming webhook with flattened response
export const processWebhook = async (payload: WebhookPayload): Promise<LegacyWebhookResult> => {
  try {
    console.log(`🔄 Processing webhook payload:`, payload);
    
    let resellerId: string;

    // Try to identify reseller by API key first, then fall back to direct reseller ID
    if (payload.api_key) {
      console.log('🔍 Looking up reseller by API key');
      
      // Find the reseller by API key
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('reseller_api_keys')
        .select('reseller_id, is_active, usage_count')
        .eq('api_key', payload.api_key)
        .eq('is_active', true)
        .single();

      if (apiKeyError || !apiKeyData) {
        console.error('❌ Invalid or inactive API key:', payload.api_key);
        return {
          success: false,
          message: "Invalid or inactive API key",
          errors: ['invalid_api_key']
        };
      }

      resellerId = apiKeyData.reseller_id;
      console.log(`✅ Found reseller ID: ${resellerId}`);

      // Update API key usage
      const { error: updateError } = await supabase
        .from('reseller_api_keys')
        .update({ 
          usage_count: apiKeyData.usage_count + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('api_key', payload.api_key);

      if (updateError) {
        console.error('⚠️ Failed to update API key usage:', updateError);
      }
    } else if (payload.resellerId) {
      // Legacy support for direct reseller ID
      resellerId = payload.resellerId;
      console.log(`📋 Using legacy reseller ID: ${resellerId}`);
    } else {
      console.error('❌ Missing API key or reseller ID in webhook payload');
      return {
        success: false,
        message: "Missing API key or reseller ID in webhook payload",
        errors: ['missing_auth']
      };
    }

    // Extract customer data - supporting both new and old formats
    const customerName = payload.customer?.name || payload.customerName;
    const customerEmail = payload.customer?.email || payload.customerEmail;
    const planDuration = payload.customer?.plan_duration_months || payload.planDuration;
    
    // Determine action type (default to 'create' for backward compatibility)
    const action = payload.action || 'create';
    
    // Check if this is a trial account
    const isTrialAccount = payload.is_trial || false;
    
    console.log(`🎯 Processing ${action} action for customer: ${customerName} (${customerEmail}) - Trial: ${isTrialAccount}`);
    
    // Validate payload
    if (!customerName || !customerEmail || !planDuration) {
      console.error('❌ Missing required customer fields');
      return {
        success: false,
        message: "Missing required customer fields in webhook payload",
        errors: ['missing_customer_data']
      };
    }

    // Handle renewal action
    if (action === 'renew') {
      console.log('🔄 Processing renewal request');
      
      // Find existing customer
      const existingCustomer = await findCustomerByNameAndEmail(customerName, customerEmail, resellerId);
      
      if (!existingCustomer) {
        return {
          success: false,
          message: `No customer found with name "${customerName}" and email "${customerEmail}"`,
          errors: ['customer_not_found']
        };
      }

      // Process the renewal
      const renewalResult = await processCustomerRenewal(
        existingCustomer,
        planDuration,
        resellerId,
        payload.contact_id || payload.contactId
      );

      return renewalResult;
    }

    // Handle create action (existing logic with trial support and enhanced HighLevel integration)
    console.log('➕ Processing customer creation request');
    
    const macAddress = payload.customer?.mac || payload.macAddress;
    const deviceType = payload.customer?.device_type || payload.deviceType || 'Smart TV';
    
    // Extract package ID from payload or use default
    const packageId = payload.customer?.package_id || payload.packageId;
    
    // Extract HighLevel contact ID for sending credentials
    const contactId = payload.contact_id || payload.contactId;
    
    console.log(`👤 Customer data extracted:`, { 
      customerName, 
      customerEmail, 
      macAddress, 
      deviceType, 
      planDuration,
      packageId,
      contactId,
      isTrialAccount
    });
    
    // Validate required fields for creation
    if (!macAddress) {
      console.error('❌ MAC address is required for customer creation');
      return {
        success: false,
        message: "MAC address is required for customer creation",
        errors: ['missing_mac_address']
      };
    }

    // Check if reseller exists and has enough credits (skip for trial accounts)
    let reseller: any;
    if (!isTrialAccount) {
      const { data: resellerData, error: resellerError } = await supabase
        .from('profiles')
        .select('credits, name')
        .eq('id', resellerId)
        .single();

      if (resellerError || !resellerData) {
        console.error('❌ Reseller not found:', resellerError?.message);
        return {
          success: false,
          message: `Reseller not found: ${resellerError?.message || 'Unknown error'}`,
          errors: ['reseller_not_found']
        };
      }

      reseller = resellerData;
      console.log(`💰 Reseller credits: ${reseller.credits}, required: ${planDuration}`);

      if (reseller.credits < planDuration) {
        console.error('❌ Insufficient credits');
        return {
          success: false,
          message: `Insufficient credits: Reseller has ${reseller.credits} credits, but ${planDuration} are required`,
          errors: ['insufficient_credits']
        };
      }
    } else {
      console.log('🆓 Trial account - skipping credit check');
      
      // Get reseller info for trial account
      const { data: resellerData, error: resellerError } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', resellerId)
        .single();

      if (resellerError || !resellerData) {
        console.error('❌ Reseller not found:', resellerError?.message);
        return {
          success: false,
          message: `Reseller not found: ${resellerError?.message || 'Unknown error'}`,
          errors: ['reseller_not_found']
        };
      }

      reseller = resellerData;
    }

    // Generate IPTV credentials (used as fallback if API doesn't return credentials)
    const fallbackUsername = generateUsername(customerName);
    const fallbackPassword = generatePassword();

    console.log(`🔑 Generated fallback credentials - Username: ${fallbackUsername}, Password: ${fallbackPassword}`);

    // Calculate dates
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + planDuration);
    const expirationDate = expiryDate.toISOString().split('T')[0];

    console.log(`📅 Subscription dates - Start: ${startDate}, Expiry: ${expirationDate}`);

    // Get the package ID to use (from payload or default)
    const finalPackageId = packageId || await getDefaultPackageId();
    console.log(`📦 Using package ID: ${finalPackageId}`);

    // Call IPTV API via edge function
    console.log('📡 Creating IPTV user via edge function');
    const { data, error } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        userParams: {
          username: fallbackUsername,
          password: fallbackPassword,
          maxConnections: 1,
          expiryDate: expiryDate.toISOString(),
          isTrial: isTrialAccount,
          bouquet: finalPackageId, // Use the determined package ID
          output: "ts",
          customerName,
          resellerName: "Trial Account" // For trial accounts
        }
      }
    });
    
    if (error || !data?.success) {
      console.error('❌ Failed to create IPTV user:', error || data);
      return {
        success: false,
        message: "Failed to create IPTV user",
        errors: ['iptv_creation_failed']
      };
    }

    console.log('✅ IPTV user created successfully');

    // Extract the actual credentials from the API response
    let finalUsername = fallbackUsername;
    let finalPassword = fallbackPassword;

    // Check if the API returned actual credentials
    if (data.user && data.user.username && data.user.password) {
      finalUsername = data.user.username;
      finalPassword = data.user.password;
      console.log(`🔑 Using actual credentials from API - Username: ${finalUsername}, Password: ${finalPassword}`);
    } else {
      console.log(`⚠️ API did not return credentials, using fallback - Username: ${finalUsername}, Password: ${finalPassword}`);
    }

    // Create customer record in database with the actual credentials
    const customerData: any = {
      reseller_id: resellerId,
      name: customerName,
      email: customerEmail,
      mac_address: macAddress,
      device_type: deviceType,
      plan_duration: planDuration,
      start_date: startDate,
      expiration_date: expirationDate,
      username: finalUsername,  // Use actual credentials from API
      password: finalPassword,   // Use actual credentials from API
      highlevel_contact_id: contactId,  // Store the HighLevel contact ID
      is_trial: isTrialAccount,
      trial_created_at: isTrialAccount ? new Date().toISOString() : null
    };

    console.log('💾 Inserting customer into database with actual credentials');
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (customerError) {
      console.error('❌ Failed to add customer to database:', customerError);
      return {
        success: false,
        message: `Failed to add customer to database: ${customerError.message}`,
        errors: ['database_insert_failed']
      };
    }

    console.log('✅ Customer added to database with ID:', customer.id);

    // Deduct credits from reseller only if not a trial account
    if (!isTrialAccount) {
      console.log('💳 Deducting credits from reseller');
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: reseller.credits - planDuration })
        .eq('id', resellerId);

      if (creditError) {
        console.error('❌ Failed to deduct credits:', creditError);
        return {
          success: false,
          message: `Failed to deduct credits: ${creditError.message}`,
          errors: ['credit_deduction_failed']
        };
      }

      // Log the transaction
      console.log('📝 Logging credit transaction with actual credentials');
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'account_creation',
          credits_used: planDuration,
          customer_id: customer.id,
          customer_name: customerName,
          notes: `${planDuration} month subscription via ${payload.api_key ? 'API key' : 'webhook'} (Package: ${finalPackageId}) - Credentials: ${finalUsername}/${finalPassword}`
        });

      if (logError) {
        console.error("⚠️ Failed to log transaction:", logError);
      }
    } else {
      console.log('🆓 Trial account - skipping credit deduction and logging');
    }

    // Enhanced HighLevel integration with multi-credential support
    if (contactId) {
      console.log('🎯 HighLevel contact ID provided, syncing with multi-credential support');
      
      // Create mock customers array for sync function (single customer for now)
      const customersForSync = [{
        username: finalUsername,
        password: finalPassword,
        m3u_url: data.user?.m3u_url,
        plan_duration: planDuration
      }];
      
      // Sync contact with multi-credential support
      await syncContactWithMultiCredentials(
        contactId,
        {
          name: customerName,
          email: customerEmail,
          deviceType: deviceType,
          planDuration: planDuration
        },
        resellerId,
        customersForSync
      );
      
      // Also send credentials message
      await sendHighLevelCredentials(
        contactId,
        customerName,
        finalUsername,
        finalPassword,
        resellerId,
        data.user?.m3u_url
      );
    } else {
      console.log('ℹ️ No HighLevel contact ID provided, skipping HighLevel integration');
    }

    console.log('🎉 Webhook processing completed successfully');

    // Return flattened success response for HighLevel compatibility
    return {
      success: true,
      message: isTrialAccount ? "Trial account created successfully" : "Customer provisioned successfully",
      name: customerName,
      email: customerEmail,
      device_type: deviceType,
      start_date: startDate,
      end_date: expirationDate,
      account_type: macAddress ? 'mag' : 'm3u',
      username: finalUsername,
      password: finalPassword,
      m3u_url: data.user?.m3u_url || '',
      credits_used: isTrialAccount ? 0 : planDuration
    };
  } catch (error) {
    console.error("💥 Error processing webhook:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      errors: ['unknown_processing_error']
    };
  }
};
