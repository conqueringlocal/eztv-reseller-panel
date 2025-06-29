
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    isTrial?: boolean;
    trialDurationHours?: number;
  };
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

    console.log(`🚀 Creating consolidated M3U users for reseller: ${resellerId}`);
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

    // Get reseller's profile to determine provider and check credits
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('credits, provider, name')
      .eq('id', resellerId)
      .single();

    if (resellerError || !reseller) {
      console.error('Reseller not found:', resellerError);
      return new Response(
        JSON.stringify({ error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const provider = reseller.provider || '8k';
    console.log(`📱 Using provider: ${provider}`);

    const connectionsToCreate = customerData.maxConnections || customerData.connections;
    console.log(`🔌 Creating ${connectionsToCreate} separate accounts for consolidation`);

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

    // Get API credentials from environment
    const iptvApiKey = Deno.env.get('IPTV_API_KEY');
    const panelUrl = Deno.env.get('IPTV_PANEL_URL') || 'https://my8k.me/api/api.php';

    if (!iptvApiKey) {
      console.error('IPTV API key not configured in secrets');
      return new Response(
        JSON.stringify({ error: 'IPTV API key not configured. Please contact administrator.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a unique customer group ID for consolidation
    const customerGroupId = `${customerData.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`;
    console.log(`👥 Using customer group for consolidation: ${customerGroupId}`);

    const createdCustomers = [];
    const failedConnections = [];
    const connectionList = [];

    // Create separate accounts for each connection (will be consolidated later)
    for (let i = 1; i <= connectionsToCreate; i++) {
      try {
        console.log(`🔄 Creating connection ${i} of ${connectionsToCreate} for consolidation`);

        // Generate unique username and password for this connection
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 1000);
        const username = `${customerData.name.toLowerCase().replace(/\s+/g, '')}_${i}_${timestamp}_${randomNum}`.substring(0, 32);
        const password = `pass_${i}_${timestamp}_${randomNum}`;

        console.log(`🔐 Generated credentials for connection ${i} - Username: ${username}`);

        // Create IPTV user based on provider
        let iptvResponse;
        let iptvResult;
        let customerRecord = null;

        if (provider === '8k') {
          console.log(`📡 Creating 8K M3U user ${i} with 1 connection`);
          
          const createUrl = new URL(panelUrl);
          createUrl.searchParams.append("api_key", iptvApiKey);
          createUrl.searchParams.append("action", "user_create");
          createUrl.searchParams.append("username", username);
          createUrl.searchParams.append("password", password);
          createUrl.searchParams.append("package_id", customerData.packageId);
          createUrl.searchParams.append("duration", customerData.planDuration.toString());
          createUrl.searchParams.append("max_connections", "1"); // Each account gets 1 connection
          createUrl.searchParams.append("country", "us"); // Add the country parameter

          console.log(`🔗 8K Create API URL for connection ${i}: ${createUrl.toString().replace(iptvApiKey, '[REDACTED]')}`);

          iptvResponse = await fetch(createUrl.toString());
          iptvResult = await iptvResponse.json();

          console.log(`8K API Response for connection ${i}:`, iptvResult);

          if (!iptvResponse.ok || iptvResult.error || iptvResult.status === 'error') {
            throw new Error(iptvResult.error || iptvResult.result || 'Failed to create IPTV user');
          }

          // Create customer record in database for 8K (will be consolidated later)
          console.log(`💾 Creating customer record for connection ${i}`);
          const { data: newCustomer, error: createError } = await supabaseClient
            .from('customers')
            .insert({
              reseller_id: resellerId,
              name: `${customerData.name} (Connection ${i})`,
              email: customerData.email,
              username: username,
              password: password,
              mac_address: customerData.macAddress || null,
              device_type: customerData.deviceType,
              plan_duration: customerData.planDuration,
              max_connections: 1, // Each account has 1 connection
              current_connections: 0,
              connection_details: [],
              start_date: customerData.startDate,
              expiration_date: customerData.expirationDate,
              status: customerData.status,
              is_deactivated: customerData.isDeactivated,
              is_trial: customerData.isTrial || false,
              provider: provider,
              customer_group: customerGroupId, // Group all connections together for consolidation
              customer_group_id: iptvResult.user_info?.group_id?.toString() || null,
              m3u_url: iptvResult.user_info?.m3u_url || null,
              connection_sequence: i,
              total_connections: connectionsToCreate, // Set total connections for later consolidation
              connection_list: [] // Will be populated during consolidation
            })
            .select()
            .single();

          if (createError) {
            console.error(`Error creating customer record for connection ${i}:`, createError);
            failedConnections.push({
              connectionNumber: i,
              error: createError.message,
              credentials: { username, password }
            });
            continue;
          }

          customerRecord = newCustomer;

          // Add to connection list for consolidation
          connectionList.push({
            connection_number: i,
            username: username,
            password: password,
            m3u_url: iptvResult.user_info?.m3u_url || null,
            status: customerData.status
          });

        } else if (provider === 'trex') {
          console.log(`📡 Creating Trex M3U user ${i} with 1 connection`);
          
          // Call the create-trex-user function for each connection with serviceCall parameter
          const { data: trexResult, error: trexError } = await supabaseClient.functions.invoke('create-trex-user', {
            body: {
              resellerId: resellerId,
              serviceCall: true, // Enable service call mode to bypass JWT authentication
              customerData: {
                name: `${customerData.name} (Connection ${i})`,
                email: customerData.email,
                macAddress: customerData.macAddress,
                deviceType: customerData.deviceType,
                packageId: customerData.packageId,
                planDuration: customerData.planDuration,
                connections: 1,
                maxConnections: 1,
                startDate: customerData.startDate,
                expirationDate: customerData.expirationDate,
                accountType: 'm3u',
                status: customerData.status,
                isDeactivated: customerData.isDeactivated
              }
            }
          });

          if (trexError || !trexResult?.success) {
            throw new Error(trexResult?.error || trexError?.message || 'Failed to create Trex IPTV user');
          }

          // Extract the first customer from the Trex result (since we're creating 1 connection at a time)
          const trexCustomer = trexResult.customers?.[0];
          if (!trexCustomer) {
            throw new Error('No customer data returned from Trex API');
          }

          customerRecord = trexCustomer;
          iptvResult = {
            user_info: {
              m3u_url: trexCustomer.m3u_url,
              group_id: trexCustomer.customer_group_id
            }
          };

          // Add to connection list for consolidation
          connectionList.push({
            connection_number: i,
            username: trexCustomer.username,
            password: trexCustomer.password,
            m3u_url: trexCustomer.m3u_url,
            status: customerData.status
          });

        } else {
          throw new Error(`Unsupported provider: ${provider}`);
        }

        // Add customer to created list if we have a valid customer record
        if (customerRecord) {
          createdCustomers.push({
            ...customerRecord,
            credentials: {
              username: customerRecord.username,
              password: customerRecord.password,
              maxConnections: 1,
              m3uUrl: customerRecord.m3u_url || iptvResult.user_info?.m3u_url
            }
          });

          console.log(`✅ Successfully created connection ${i} for consolidation`);
        }

      } catch (error) {
        console.error(`❌ Failed to create connection ${i}:`, error);
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
          notes: `Created ${createdCustomers.length} M3U accounts with 1 connection each (${customerData.planDuration} month${customerData.planDuration > 1 ? 's' : ''}) - Group: ${customerGroupId} - Ready for consolidation`
        });

      if (logError) {
        console.error('Error logging credit transaction:', logError);
      }
    }

    const totalCreated = createdCustomers.length;
    const totalFailed = failedConnections.length;

    console.log(`✅ M3U multi-connection creation complete: ${totalCreated} created, ${totalFailed} failed - Ready for consolidation`);

    return new Response(
      JSON.stringify({ 
        success: totalCreated > 0,
        customers: createdCustomers,
        failedConnections: failedConnections,
        summary: {
          totalRequested: connectionsToCreate,
          totalCreated: totalCreated,
          totalFailed: totalFailed,
          customerGroup: customerGroupId,
          readyForConsolidation: true
        },
        provider: provider,
        creditsUsed: totalCreated > 0 ? creditsRequired : 0,
        connectionList: connectionList // Include connection list for consolidation
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-iptv-user function:', error);
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
