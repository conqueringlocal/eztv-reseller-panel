
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
  customer?: {
    name: string;
    email: string;
    mac: string;
    device_type: string;
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

// Create HighLevel contact for customer
const createHighLevelContact = async (
  customerName: string,
  customerEmail: string,
  resellerId: string
): Promise<string | null> => {
  try {
    console.log('🎯 Creating HighLevel contact for customer:', customerName);

    const { data, error } = await supabase.functions.invoke('create-highlevel-contact', {
      body: {
        customerName,
        customerEmail,
        resellerId
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
    const macAddress = payload.customer?.mac || payload.macAddress;
    const deviceType = payload.customer?.device_type || payload.deviceType || 'Smart TV';
    const planDuration = payload.customer?.plan_duration_months || payload.planDuration;
    
    // Extract package ID from payload or use default
    const packageId = payload.customer?.package_id || payload.packageId;
    
    // Extract HighLevel contact ID for sending credentials
    let contactId = payload.contact_id || payload.contactId;
    
    // Validate payload
    if (!customerName || !customerEmail || !macAddress || !planDuration) {
      return {
        success: false,
        message: "Missing required customer fields in webhook payload"
      };
    }

    // Check if reseller exists and has enough credits
    const { data: reseller, error: resellerError } = await supabase
      .from('profiles')
      .select('credits, name')
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

    // Create HighLevel contact if not provided and reseller has HighLevel configured
    if (!contactId) {
      console.log('🔄 No contact ID provided, attempting to create HighLevel contact...');
      contactId = await createHighLevelContact(customerName, customerEmail, resellerId);
      
      if (contactId) {
        console.log('✅ HighLevel contact created with ID:', contactId);
      } else {
        console.log('ℹ️ HighLevel contact creation failed or not configured, continuing without HighLevel integration');
      }
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
      highlevel_contact_id: contactId  // Store the HighLevel contact ID
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
      message: "Customer provisioned successfully",
      customer: {
        resellerId,
        name: customerName,
        email: customerEmail,
        macAddress,
        deviceType,
        planDuration,
        startDate,
        expirationDate,
        status: 'active', // Added required property
        isDeactivated: false, // Added required property
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
