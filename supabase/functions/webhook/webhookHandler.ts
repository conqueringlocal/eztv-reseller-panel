
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
      console.log('⚠️ Default package ID not found in system settings, using fallback value "1"');
      return '1'; // Fallback to package ID "1"
    }

    console.log(`📦 Using default package ID from settings: ${data.value}`);
    return data.value;
  } catch (error) {
    console.error('❌ Error fetching default package ID:', error);
    return '1'; // Fallback to package ID "1"
  }
}

// Process incoming webhook
export const processWebhook = async (payload: WebhookPayload): Promise<{
  success: boolean;
  message: string;
  customer?: Omit<Customer, 'id' | 'createdAt'>;
}> => {
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
          message: "Invalid or inactive API key"
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
    
    console.log(`👤 Customer data extracted:`, { 
      customerName, 
      customerEmail, 
      macAddress, 
      deviceType, 
      planDuration,
      packageId 
    });
    
    // Validate payload
    if (!customerName || !customerEmail || !macAddress || !planDuration) {
      console.error('❌ Missing required customer fields');
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
      console.error('❌ Reseller not found:', resellerError?.message);
      return {
        success: false,
        message: `Reseller not found: ${resellerError?.message || 'Unknown error'}`
      };
    }

    console.log(`💰 Reseller credits: ${reseller.credits}, required: ${planDuration}`);

    if (reseller.credits < planDuration) {
      console.error('❌ Insufficient credits');
      return {
        success: false,
        message: `Insufficient credits: Reseller has ${reseller.credits} credits, but ${planDuration} are required`
      };
    }

    // Generate IPTV credentials
    const username = generateUsername(customerName);
    const password = generatePassword();

    console.log(`🔑 Generated credentials - Username: ${username}, Password: ${password}`);

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
          username,
          password,
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
      console.error('❌ Failed to create IPTV user:', error || data);
      return {
        success: false,
        message: "Failed to create IPTV user"
      };
    }

    console.log('✅ IPTV user created successfully');

    // Create customer record in database
    const customerData = {
      reseller_id: resellerId,
      name: customerName,
      email: customerEmail,
      mac_address: macAddress,
      device_type: deviceType,
      plan_duration: planDuration,
      start_date: startDate,
      expiration_date: expirationDate,
      username,
      password
    };

    console.log('💾 Inserting customer into database');
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (customerError) {
      console.error('❌ Failed to add customer to database:', customerError);
      return {
        success: false,
        message: `Failed to add customer to database: ${customerError.message}`
      };
    }

    console.log('✅ Customer added to database with ID:', customer.id);

    // Deduct credits from reseller
    console.log('💳 Deducting credits from reseller');
    const { error: creditError } = await supabase
      .from('profiles')
      .update({ credits: reseller.credits - planDuration })
      .eq('id', resellerId);

    if (creditError) {
      console.error('❌ Failed to deduct credits:', creditError);
      return {
        success: false,
        message: `Failed to deduct credits: ${creditError.message}`
      };
    }

    // Log the transaction
    console.log('📝 Logging credit transaction');
    const { error: logError } = await supabase
      .from('credit_logs')
      .insert({
        reseller_id: resellerId,
        action: 'account_creation',
        credits_used: planDuration,
        customer_id: customer.id,
        customer_name: customerName,
        notes: `${planDuration} month subscription via ${payload.api_key ? 'API key' : 'webhook'} (Package: ${finalPackageId})`
      });

    if (logError) {
      console.error("⚠️ Failed to log transaction:", logError);
    }

    console.log('🎉 Webhook processing completed successfully');

    // Return success with customer data
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
        expirationDate
      }
    };
  } catch (error) {
    console.error("💥 Error processing webhook:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
