import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateUserRequest {
  resellerId: string;
  serviceCall?: boolean; // New parameter to indicate internal service calls
  customerData: {
    name: string;
    email: string;
    macAddress?: string;
    deviceType: string;
    packageId: string;
    planDuration: number;
    connections: number;
    maxConnections?: number;
    currentConnections?: number;
    connectionDetails?: any[];
    startDate: string;
    expirationDate: string;
    accountType: 'm3u' | 'mag';
    status: string;
    isDeactivated: boolean;
  };
}

// Helper function to map plan duration to subscription format
function mapPlanDurationToSub(planDuration: number): string {
  const mapping: { [key: number]: string } = {
    1: '1',    // 1 month
    3: '3',    // 3 months  
    6: '6',    // 6 months
    12: '12',  // 12 months
    24: '99'   // 24 months -> lifetime
  };
  
  return mapping[planDuration] || '1'; // Default to 1 month if not found
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { resellerId, customerData, serviceCall = false }: CreateUserRequest = await req.json();

    console.log(`🚀 Creating Trex M3U users for reseller: ${resellerId}`);
    console.log(`📊 Customer data:`, customerData);
    console.log(`🔧 Service call mode: ${serviceCall}`);

    // Only verify JWT authentication if this is NOT a service call
    if (!serviceCall) {
      // Get the authorization header
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'No authorization header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify the JWT token
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log('🔐 Bypassing JWT authentication for service call');
    }

    // Get reseller's profile to check credits and API configuration
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('credits, provider, name, use_admin_api, api_key, panel_url')
      .eq('id', resellerId)
      .single();

    if (resellerError || !reseller) {
      console.error('Reseller not found:', resellerError);
      return new Response(
        JSON.stringify({ error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const connectionsToCreate = customerData.maxConnections || customerData.connections;
    console.log(`🔌 Creating ${connectionsToCreate} separate Trex accounts`);

    // Calculate required credits using the database function
    const { data: creditsRequired, error: creditsError } = await supabaseClient.rpc('calculate_credits_required', {
      connections: connectionsToCreate,
      duration_months: customerData.planDuration
    });

    if (creditsError) {
      console.error('Error calculating credits:', creditsError);
      return new Response(
        JSON.stringify({ error: 'Failed to calculate required credits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`💰 Credits required: ${creditsRequired}, Available: ${reseller.credits}`);

    // Idempotency guard: Check for recent account creation attempts to prevent duplicates
    if (!serviceCall) {
      try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: existingLogs, error: existingLogsError } = await supabaseClient
          .from('credit_logs')
          .select('id, date')
          .eq('reseller_id', resellerId)
          .eq('customer_name', customerData.name)
          .eq('action', 'account_creation')
          .eq('credits_used', creditsRequired)
          .gte('date', tenMinutesAgo)
          .order('date', { ascending: false })
          .limit(1);

        if (existingLogsError) {
          console.warn('⚠️ Idempotency check failed (continuing):', existingLogsError.message);
        } else if (existingLogs && existingLogs.length > 0) {
          console.log('🛑 Duplicate account creation detected via recent credit log. Skipping reprocessing.');
          const tempCustomerGroupId = `${customerData.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`;
          return new Response(
            JSON.stringify({
              success: true,
              message: 'Account creation already processed recently; skipping duplicate.',
              alreadyProcessed: true,
              customers: [],
              failedConnections: [],
              summary: {
                totalRequested: connectionsToCreate,
                totalCreated: 0,
                totalFailed: 0,
                customerGroup: tempCustomerGroupId
              },
              provider: 'trex',
              creditsUsed: 0
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (idemError) {
        console.warn('⚠️ Idempotency guard encountered an error, proceeding anyway:', idemError);
      }
    }

    // Check if reseller has enough credits
    if (reseller.credits < creditsRequired) {
      console.error(`❌ Insufficient credits: ${reseller.credits} available, ${creditsRequired} required`);
      return new Response(
        JSON.stringify({ 
          error: `Insufficient credits. Required: ${creditsRequired}, Available: ${reseller.credits}`,
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which API credentials to use based on reseller configuration
    let API_KEY: string;
    let PANEL_URL: string;

    if (reseller.use_admin_api) {
      // Use admin API keys
      API_KEY = Deno.env.get('TREX_API_KEY')!;
      PANEL_URL = Deno.env.get('TREX_PANEL_URL')!;
      
      if (!API_KEY || !PANEL_URL) {
        console.error('Admin Trex API configuration not found');
        return new Response(
          JSON.stringify({ error: 'Admin Trex API configuration not found' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('🔑 Using admin API keys for Trex operations');
    } else {
      // Use reseller's own API keys
      API_KEY = reseller.api_key;
      PANEL_URL = reseller.panel_url;
      
      if (!API_KEY || !PANEL_URL) {
        console.error('Reseller Trex API configuration not found');
        return new Response(
          JSON.stringify({ error: 'Reseller API configuration not found. Please configure your API keys.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('🔑 Using reseller API keys for Trex operations');
    }

    // Generate a unique customer group ID
    const customerGroupId = `${customerData.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`;
    console.log(`👥 Using customer group: ${customerGroupId}`);

    const createdCustomers = [];
    const failedConnections = [];

    // Create separate accounts for each connection
    for (let i = 1; i <= connectionsToCreate; i++) {
      try {
        console.log(`🔄 Creating Trex connection ${i} of ${connectionsToCreate}`);

        // Generate unique username and password for this connection
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 1000);
        const username = `${customerData.name.toLowerCase().replace(/\s+/g, '')}_${i}_${timestamp}_${randomNum}`.substring(0, 32);
        const password = `pass_${i}_${timestamp}_${randomNum}`;

        console.log(`🔐 Generated credentials for Trex connection ${i} - Username: ${username}`);

        // Map plan duration to subscription format
        const subscriptionPeriod = mapPlanDurationToSub(customerData.planDuration);

        console.log(`📦 Creating Trex M3U user ${i} with package ID: ${customerData.packageId}`);
        console.log(`📅 Subscription period: ${subscriptionPeriod} (${customerData.planDuration} months)`);
        
        // Construct the URL with the correct Trex parameters in the specified order
        // Format: https://activationpanel.net/api/api.php?action=new&type=m3u&sub=12&pack=132&api_key=KEY
        const baseUrl = PANEL_URL.replace('/api/api.php', '');
        const apiUrl = new URL(`${baseUrl}/api/api.php`);
        
        // Add parameters in the exact order specified by the user
        apiUrl.searchParams.append('action', 'new');
        apiUrl.searchParams.append('type', 'm3u');
        apiUrl.searchParams.append('sub', subscriptionPeriod);
        apiUrl.searchParams.append('pack', customerData.packageId);
        apiUrl.searchParams.append('api_key', API_KEY);
        apiUrl.searchParams.append('note', `Customer: ${customerData.name} | Reseller: ${reseller.name || 'Unknown Reseller'}`);
        
        console.log(`🔗 Trex Create API URL for connection ${i}: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`);

        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'IPTV-Management-System/1.0',
            'Accept': 'application/json, text/plain, */*',
            'Cache-Control': 'no-cache',
          },
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });
        
        const responseText = await response.text();
        console.log(`📡 Trex API Response Status for connection ${i}: ${response.status}`);
        console.log(`📡 Trex API Response for connection ${i}: ${responseText}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Try to parse as JSON first
        let apiResult;
        try {
          apiResult = JSON.parse(responseText);
        } catch (parseError) {
          // If it's not JSON, check if it contains credentials in text format
          console.log(`📄 Parsing text response for connection ${i}`);
          
          // Look for common patterns in text responses that might contain credentials
          if (responseText.includes('username') || responseText.includes('password') || responseText.includes('m3u')) {
            // Try to extract credentials from text response
            const lines = responseText.split('\n');
            let extractedUsername = username; // fallback to generated username
            let extractedPassword = password; // fallback to generated password
            
            // Look for username/password patterns in the response
            for (const line of lines) {
              if (line.toLowerCase().includes('username') && line.includes(':')) {
                const match = line.split(':')[1]?.trim();
                if (match) extractedUsername = match;
              }
              if (line.toLowerCase().includes('password') && line.includes(':')) {
                const match = line.split(':')[1]?.trim();
                if (match) extractedPassword = match;
              }
            }
            
            apiResult = {
              success: true,
              username: extractedUsername,
              password: extractedPassword,
              response: responseText
            };
          } else if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('fail')) {
            throw new Error(`API Error: ${responseText}`);
          } else {
            // Assume success if no error indicators and use generated credentials
            apiResult = {
              success: true,
              username: username,
              password: password,
              response: responseText
            };
          }
        }

        // Check for API errors in JSON response
        if (apiResult.error || apiResult.status === 'error') {
          throw new Error(apiResult.error || apiResult.result || 'Failed to create Trex IPTV user');
        }

        // Use credentials from API response or fallback to generated ones
        const finalUsername = apiResult.username || username;
        const finalPassword = apiResult.password || password;

        // Use M3U URL from API response if available, otherwise construct from base URL
        let m3uUrl;
        if (apiResult.url) {
          // Use the URL provided by the Trex API response
          m3uUrl = apiResult.url;
          console.log(`🔗 Using M3U URL from API response: ${m3uUrl}`);
        } else {
          // Fallback to constructing URL from base URL if not provided in response
          m3uUrl = `${baseUrl}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`;
          console.log(`🔧 Constructed M3U URL from base URL: ${m3uUrl}`);
        }

        // Create customer record in database
        console.log(`💾 Creating Trex customer record for connection ${i}`);
        const { data: newCustomer, error: createError } = await supabaseClient
          .from('customers')
          .insert({
            reseller_id: resellerId,
            name: `${customerData.name} (Connection ${i})`,
            email: customerData.email,
            username: finalUsername,
            password: finalPassword,
            mac_address: customerData.macAddress || null,
            device_type: customerData.deviceType,
            package_id: customerData.packageId,
            plan_duration: customerData.planDuration,
            max_connections: 1, // Each account has 1 connection
            current_connections: 0,
            connection_details: [],
            start_date: customerData.startDate,
            expiration_date: customerData.expirationDate,
            status: customerData.status,
            is_deactivated: customerData.isDeactivated,
            provider: 'trex',
            customer_group: customerGroupId, // Group all connections together
            customer_group_id: apiResult.user_id?.toString() || null,
            m3u_url: m3uUrl,
            connection_sequence: i
          })
          .select()
          .single();

        if (createError) {
          console.error(`Error creating Trex customer record for connection ${i}:`, createError);
          failedConnections.push({
            connectionNumber: i,
            error: createError.message,
            credentials: { username: finalUsername, password: finalPassword }
          });
          continue;
        }

        createdCustomers.push({
          ...newCustomer,
          credentials: {
            username: finalUsername,
            password: finalPassword,
            maxConnections: 1,
            m3uUrl: m3uUrl
          }
        });

        console.log(`✅ Successfully created Trex connection ${i} with credentials: ${finalUsername}/${finalPassword}`);

      } catch (error) {
        console.error(`❌ Failed to create Trex connection ${i}:`, error);
        failedConnections.push({
          connectionNumber: i,
          error: error.message
        });
      }
    }

    // Only deduct credits if at least one account was created successfully
    if (createdCustomers.length > 0) {
      console.log(`💳 Deducting ${creditsRequired} credits from reseller`);
      const { error: creditError } = await supabaseClient
        .from('profiles')
        .update({ credits: reseller.credits - creditsRequired })
        .eq('id', resellerId);

      if (creditError) {
        console.error('Error deducting credits:', creditError);
        // Customer was created but credits weren't deducted - log this for manual review
      }

      // Log the credit transaction
      const { error: logError } = await supabaseClient
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'account_creation',
          credits_used: creditsRequired,
          connections_used: connectionsToCreate,
          customer_id: createdCustomers[0].id, // Use first customer ID as reference
          customer_name: customerData.name,
          notes: `${customerData.name} | ${reseller.name}`
        });

      if (logError) {
        console.error('Error logging credit transaction:', logError);
      }

      // Consolidate connections if multiple were created
      if (createdCustomers.length > 1) {
        console.log(`🔄 Consolidating ${createdCustomers.length} Trex accounts into single record`);
        
        try {
          const { data: consolidationResult, error: consolidationError } = await supabaseClient
            .rpc('consolidate_customer_connections', {
              customer_group_name: customerGroupId,
              reseller_id_param: resellerId
            });

          if (consolidationError) {
            console.error('Error consolidating connections:', consolidationError);
          } else {
            console.log('✅ Successfully consolidated Trex connections:', consolidationResult);
          }
        } catch (consolidationError) {
          console.error('Error during consolidation:', consolidationError);
        }
      }
    }

    const totalCreated = createdCustomers.length;
    const totalFailed = failedConnections.length;

    console.log(`✅ Trex M3U multi-connection creation complete: ${totalCreated} created, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({ 
        success: totalCreated > 0,
        customers: createdCustomers,
        failedConnections: failedConnections,
        summary: {
          totalRequested: connectionsToCreate,
          totalCreated: totalCreated,
          totalFailed: totalFailed,
          customerGroup: customerGroupId
        },
        provider: 'trex',
        creditsUsed: totalCreated > 0 ? creditsRequired : 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-trex-user function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
