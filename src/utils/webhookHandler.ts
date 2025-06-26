
import { Customer } from "../contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { generateUsername, generatePassword, dateToUnixTimestamp } from "./iptvApi";

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

// Get default package ID from system settings
const getDefaultPackageId = async (): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('id', 'default_package_id')
      .single();

    if (error || !data) {
      console.log('Default package ID not found in system settings, using fallback value "14826"');
      return '14826'; // Fallback to package ID "14826"
    }

    console.log(`Using default package ID from settings: ${data.value}`);
    return data.value;
  } catch (error) {
    console.error('Error fetching default package ID:', error);
    return '14826'; // Fallback to package ID "14826"
  }
};

// Create HighLevel contact for customer with IPTV credentials
const createHighLevelContact = async (
  customerName: string,
  customerEmail: string,
  resellerId: string,
  iptvCredentials?: {
    username?: string;
    password?: string;
    m3uUrl?: string;
  }
): Promise<string | null> => {
  try {
    console.log('🎯 Creating HighLevel contact for customer:', customerName);

    const { data, error } = await supabase.functions.invoke('create-highlevel-contact', {
      body: {
        customerName,
        customerEmail,
        resellerId,
        iptvCredentials
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to create HighLevel contact:', error || data);
      return null;
    }

    console.log('✅ HighLevel contact created successfully:', data.contactId);
    return data.contactId;
  } catch (error) {
    console.error('💥 Error creating HighLevel contact:', error);
    return null;
  }
};

// Update HighLevel contact with IPTV credentials
const updateHighLevelContactCredentials = async (
  contactId: string,
  resellerId: string,
  iptvCredentials: {
    username: string;
    password: string;
    m3uUrl?: string;
  }
): Promise<boolean> => {
  try {
    console.log('🔄 Updating HighLevel contact credentials for contact:', contactId);

    const { data, error } = await supabase.functions.invoke('update-highlevel-contact-credentials', {
      body: {
        contactId,
        resellerId,
        iptvCredentials
      }
    });

    if (error || !data?.success) {
      console.error('❌ Failed to update HighLevel contact credentials:', error || data);
      return false;
    }

    console.log('✅ HighLevel contact credentials updated successfully');
    return true;
  } catch (error) {
    console.error('💥 Error updating HighLevel contact credentials:', error);
    return false;
  }
};

// Send credentials via HighLevel (if contact ID is provided and credentials are available)
const sendHighLevelCredentials = async (
  contactId: string,
  customerName: string,
  username: string,
  password: string,
  resellerId: string,
  m3uUrl?: string
): Promise<void> => {
  try {
    console.log('📨 Attempting to send credentials via HighLevel to contact:', contactId);

    const { data, error } = await supabase.functions.invoke('send-highlevel-message', {
      body: {
        contactId,
        customerName,
        username,
        password,
        m3uUrl,
        resellerId,
        messageType: 'SMS'
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
};

// Find existing customer by name and email
const findCustomerByNameAndEmail = async (
  customerName: string,
  customerEmail: string,
  resellerId: string
): Promise<Customer | null> => {
  try {
    console.log(`🔍 Looking for existing customer: ${customerName} (${customerEmail}) for reseller: ${resellerId}`);
    
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .eq('reseller_id', resellerId)
      .eq('name', customerName)
      .eq('email', customerEmail)
      .eq('status', 'active') // Only look for active customers
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
    
    // Transform database format to Customer interface
    return {
      id: customer.id,
      resellerId: customer.reseller_id,
      name: customer.name,
      email: customer.email,
      macAddress: customer.mac_address,
      deviceType: customer.device_type,
      planDuration: customer.plan_duration,
      startDate: customer.start_date,
      expirationDate: customer.expiration_date,
      createdAt: customer.created_at,
      username: customer.username,
      password: customer.password,
      status: customer.status as 'active' | 'cancelled' | 'expired' | 'expiring_soon',
      isDeactivated: customer.is_deactivated,
      cancelledAt: customer.cancelled_at,
      customerGroupId: customer.customer_group_id,
      customerGroup: customer.customer_group || '', // Add customerGroup mapping
      connectionNumber: customer.connection_number,
      maxConnections: customer.max_connections || 1, // Fix: use maxConnections instead of connections
      highlevelContactId: customer.highlevel_contact_id,
      m3uUrl: customer.m3u_url,
      connectionSequence: customer.connection_sequence
    };
  } catch (error) {
    console.error('💥 Error in findCustomerByNameAndEmail:', error);
    return null;
  }
};

// Process customer renewal
const processCustomerRenewal = async (
  customer: Customer,
  additionalMonths: number,
  resellerId: string,
  contactId?: string
): Promise<{
  success: boolean;
  message: string;
}> => {
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
        message: `Reseller not found: ${resellerError?.message || 'Unknown error'}`
      };
    }

    if (reseller.credits < additionalMonths) {
      console.error('❌ Insufficient credits for renewal');
      return {
        success: false,
        message: `Insufficient credits: Reseller has ${reseller.credits} credits, but ${additionalMonths} are required`
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
        message: "Failed to renew IPTV user in panel"
      };
    }

    console.log('✅ IPTV user renewed successfully');

    // Calculate new expiration date
    const currentExpiry = new Date(customer.expirationDate);
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
        message: `Failed to update customer record: ${updateError.message}`
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
        message: `Failed to deduct credits: ${creditError.message}`
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

    // Update HighLevel contact with renewed credentials if contact ID is available
    if ((contactId || customer.highlevelContactId) && customer.username && customer.password) {
      const finalContactId = contactId || customer.highlevelContactId;
      console.log('🔄 Updating HighLevel contact with renewed credentials');
      
      await updateHighLevelContactCredentials(
        finalContactId!,
        resellerId,
        {
          username: customer.username,
          password: customer.password,
          m3uUrl: customer.m3uUrl
        }
      );
    }

    // Send renewal confirmation via HighLevel if contact ID is available
    if (contactId || customer.highlevelContactId) {
      const finalContactId = contactId || customer.highlevelContactId;
      console.log('📨 Sending renewal confirmation via HighLevel');
      
      await sendHighLevelCredentials(
        finalContactId!,
        customer.name,
        customer.username || '',
        customer.password || '',
        resellerId,
        customer.m3uUrl
      );
    }

    console.log('🎉 Customer renewal completed successfully');

    return {
      success: true,
      message: `Customer ${customer.name} renewed successfully for ${additionalMonths} months`
    };
  } catch (error) {
    console.error('💥 Error in processCustomerRenewal:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error during renewal"
    };
  }
};

// Process incoming webhook
export const processWebhook = async (payload: WebhookPayload): Promise<{
  success: boolean;
  message: string;
  customer?: Omit<Customer, 'id' | 'createdAt'>;
}> => {
  try {
    let resellerId: string;

    // Try to identify reseller by API key first, then fall back to direct reseller ID
    if (payload.api_key) {
      console.log('Looking up reseller by API key');
      
      // Find the reseller by API key
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('reseller_api_keys')
        .select('reseller_id, is_active, usage_count')
        .eq('api_key', payload.api_key)
        .eq('is_active', true)
        .single();

      if (apiKeyError || !apiKeyData) {
        return {
          success: false,
          message: "Invalid or inactive API key"
        };
      }

      resellerId = apiKeyData.reseller_id;

      // Update API key usage
      const { error: updateError } = await supabase
        .from('reseller_api_keys')
        .update({ 
          usage_count: apiKeyData.usage_count + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('api_key', payload.api_key);

      if (updateError) {
        console.error('Failed to update API key usage:', updateError);
      }
    } else if (payload.resellerId) {
      // Legacy support for direct reseller ID
      resellerId = payload.resellerId;
    } else {
      return {
        success: false,
        message: "Missing API key or reseller ID in webhook payload"
      };
    }

    // Extract customer data - supporting both new and old formats
    const customerName = payload.customer?.name || payload.customerName;
    const customerEmail = payload.customer?.email || payload.customerEmail;
    const planDuration = payload.customer?.plan_duration_months || payload.planDuration;
    
    // Determine action type (default to 'create' for backward compatibility)
    const action = payload.action || 'create';
    
    console.log(`🎯 Processing ${action} action for customer: ${customerName} (${customerEmail})`);
    
    // Validate payload
    if (!customerName || !customerEmail || !planDuration) {
      return {
        success: false,
        message: "Missing required customer fields in webhook payload"
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
          message: `No active customer found with name "${customerName}" and email "${customerEmail}"`
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

    // Handle create action (existing logic)
    console.log('➕ Processing customer creation request');
    
    const macAddress = payload.customer?.mac || payload.macAddress;
    const deviceType = payload.customer?.device_type || payload.deviceType || 'Smart TV';
    
    // Extract package ID from payload or use default
    const packageId = payload.customer?.package_id || payload.packageId;
    
    // Extract HighLevel contact ID for sending credentials
    let contactId = payload.contact_id || payload.contactId;
    
    // Validate required fields for creation
    if (!macAddress) {
      return {
        success: false,
        message: "MAC address is required for customer creation"
      };
    }

    // Check if reseller exists and has enough credits - select provider as well
    const { data: reseller, error: resellerError } = await supabase
      .from('profiles')
      .select('credits, name, provider')
      .eq('id', resellerId)
      .single();

    if (resellerError || !reseller) {
      return {
        success: false,
        message: `Reseller not found: ${resellerError?.message || 'Unknown error'}`
      };
    }

    if (reseller.credits < planDuration) {
      return {
        success: false,
        message: `Insufficient credits: Reseller has ${reseller.credits} credits, but ${planDuration} are required`
      };
    }

    // Generate IPTV credentials (used as fallback if API doesn't return credentials)
    const fallbackUsername = generateUsername(customerName);
    const fallbackPassword = generatePassword();

    // Calculate dates
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + planDuration);
    const expirationDate = expiryDate.toISOString().split('T')[0];

    // Get the package ID to use (from payload or default)
    const finalPackageId = packageId || await getDefaultPackageId();
    console.log(`Using package ID: ${finalPackageId}`);

    // Call IPTV API via edge function
    const { data, error } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        userParams: {
          username: fallbackUsername,
          password: fallbackPassword,
          maxConnections: 1,
          expiryDate: expiryDate.toISOString(),
          isTrial: false,
          bouquet: finalPackageId, // Use the determined package ID
          output: "ts",
          customerName,
          resellerName: reseller.name
        }
      }
    });
    
    if (error || !data?.success) {
      console.error('Failed to create IPTV user:', error || data);
      return {
        success: false,
        message: "Failed to create IPTV user"
      };
    }

    // Extract the actual credentials from the API response
    let finalUsername = fallbackUsername;
    let finalPassword = fallbackPassword;

    // Check if the API returned actual credentials
    if (data.user && data.user.username && data.user.password) {
      finalUsername = data.user.username;
      finalPassword = data.user.password;
      console.log(`Using actual credentials from API - Username: ${finalUsername}, Password: ${finalPassword}`);
    } else {
      console.log(`API did not return credentials, using fallback - Username: ${finalUsername}, Password: ${finalPassword}`);
    }

    // Prepare IPTV credentials for HighLevel contact
    const iptvCredentials = {
      username: finalUsername,
      password: finalPassword,
      m3uUrl: data.user?.m3u_url
    };

    // Create HighLevel contact with IPTV credentials if not provided
    if (!contactId) {
      console.log('🔄 No contact ID provided, attempting to create HighLevel contact with IPTV credentials...');
      contactId = await createHighLevelContact(customerName, customerEmail, resellerId, iptvCredentials);
      
      if (contactId) {
        console.log('✅ HighLevel contact created with ID and credentials:', contactId);
      } else {
        console.log('ℹ️ HighLevel contact creation failed or not configured, continuing without HighLevel integration');
      }
    } else {
      // Update existing contact with IPTV credentials
      console.log('🔄 Contact ID provided, updating with IPTV credentials...');
      await updateHighLevelContactCredentials(contactId, resellerId, iptvCredentials);
    }

    // Generate customer group ID
    const customerGroupId = `${customerEmail.toLowerCase()}_${resellerId}`;

    // Create customer record in database with the actual credentials
    const customerData = {
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
      m3u_url: data.user?.m3u_url,
      highlevel_contact_id: contactId,  // Store the HighLevel contact ID
      customer_group: customerGroupId, // Add required customer_group field
      connection_sequence: 1, // Add connection sequence
      max_connections: 1, // Add max connections
      current_connections: 0, // Add current connections
      connection_details: [], // Add connection details
      provider: reseller.provider || '8k' // Add provider
    };

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (customerError) {
      return {
        success: false,
        message: `Failed to add customer to database: ${customerError.message}`
      };
    }

    // Deduct credits from reseller
    const { error: creditError } = await supabase
      .from('profiles')
      .update({ credits: reseller.credits - planDuration })
      .eq('id', resellerId);

    if (creditError) {
      return {
        success: false,
        message: `Failed to deduct credits: ${creditError.message}`
      };
    }

    // Log the transaction
    const { error: logError } = await supabase
      .from('credit_logs')
      .insert({
        reseller_id: resellerId,
        action: 'account_creation',
        credits_used: planDuration,
        customer_id: customer.id,
        customer_name: customerName,
        notes: `${planDuration} month subscription via ${payload.api_key ? 'API key' : 'webhook'} (Package: ${finalPackageId}) - Credentials: ${finalUsername}/${finalPassword}${contactId ? ` - HL Contact: ${contactId}` : ''}`
      });

    if (logError) {
      console.error("Failed to log transaction:", logError);
    }

    // Send credentials via HighLevel if contact ID is available
    if (contactId) {
      console.log('🎯 HighLevel contact ID available, attempting to send credentials via HighLevel');
      await sendHighLevelCredentials(
        contactId,
        customerName,
        finalUsername,
        finalPassword,
        resellerId,
        data.user?.m3u_url
      );
    } else {
      console.log('ℹ️ No HighLevel contact ID available, skipping HighLevel integration');
    }

    // Return success with customer data (using actual credentials) - Fixed to include required properties
    return {
      success: true,
      message: "Customer provisioned successfully with IPTV credentials added to CRM",
      customer: {
        resellerId,
        name: customerName,
        email: customerEmail,
        macAddress,
        deviceType,
        planDuration,
        startDate,
        expirationDate,
        status: 'active',
        isDeactivated: false,
        customerGroup: customerGroupId, // Add required customerGroup field
        maxConnections: 1, // Add maxConnections instead of connections
      }
    };
  } catch (error) {
    console.error("Error processing webhook:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
