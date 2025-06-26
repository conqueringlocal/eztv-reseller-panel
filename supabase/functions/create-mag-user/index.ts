
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateMagUserRequest {
  resellerId: string;
  customerData: {
    name: string;
    email: string;
    macAddress?: string;
    deviceType: string;
    packageId: string;
    planDuration: number;
    connections: number;
    maxConnections?: number;
    startDate: string;
    expirationDate: string;
    status: string;
    isDeactivated: boolean;
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

    const { resellerId, customerData }: CreateMagUserRequest = await req.json();

    console.log(`🎯 Creating MAG users for reseller: ${resellerId}`);
    console.log(`📊 Customer data:`, customerData);

    // Get reseller's profile to check credits
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('credits, provider')
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
    console.log(`🔌 Creating ${connectionsToCreate} separate MAG accounts`);

    // Calculate required credits
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

    // Get IPTV panel credentials from Supabase secrets
    const iptvApiKey = Deno.env.get('IPTV_API_KEY');
    const panelUrl = Deno.env.get('IPTV_PANEL_URL') || 'https://my8k.me/api/api.php';

    if (!iptvApiKey) {
      console.error('IPTV API key not configured in secrets');
      return new Response(
        JSON.stringify({ error: 'IPTV API key not configured. Please contact administrator.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a unique customer group ID
    const customerGroupId = `${customerData.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`;
    console.log(`👥 Using customer group: ${customerGroupId}`);

    // Convert expiry date to Unix timestamp
    const expiryTimestamp = Math.floor(new Date(customerData.expirationDate).getTime() / 1000);

    const createdCustomers = [];
    const failedConnections = [];

    // Create separate MAG accounts for each connection
    for (let i = 1; i <= connectionsToCreate; i++) {
      try {
        console.log(`🔄 Creating MAG connection ${i} of ${connectionsToCreate}`);

        // Generate unique MAC address for this connection
        const baseMac = customerData.macAddress || '00:1A:79:00:00:00';
        const macParts = baseMac.split(':');
        const lastOctet = parseInt(macParts[5], 16) + (i - 1);
        const uniqueMac = `${macParts.slice(0, 5).join(':')}:${lastOctet.toString(16).padStart(2, '0').toUpperCase()}`;

        console.log(`📦 MAC Address for connection ${i}: ${uniqueMac}`);

        // Call IPTV panel to create MAG user
        console.log(`📡 Calling IPTV panel to create MAG user ${i} for MAC: ${uniqueMac}`);
        
        const createUrl = new URL(panelUrl);
        createUrl.searchParams.append("api_key", iptvApiKey);
        createUrl.searchParams.append("action", "create");
        createUrl.searchParams.append("type", "mag");
        createUrl.searchParams.append("mac", uniqueMac);
        createUrl.searchParams.append("bouquet", customerData.packageId);
        createUrl.searchParams.append("mag_expire", expiryTimestamp.toString());
        createUrl.searchParams.append("is_trial", "0");

        console.log(`🔗 MAG Creation API URL for connection ${i}: ${createUrl.toString().replace(iptvApiKey, '[REDACTED]')}`);

        const iptvResponse = await fetch(createUrl.toString());
        const iptvData = await iptvResponse.json();

        console.log(`IPTV API Response for connection ${i}:`, iptvData);

        // Check if the response indicates success
        if (!iptvResponse.ok || iptvData.error || iptvData.status === 'error') {
          throw new Error(`Failed to create MAG user: ${JSON.stringify(iptvData)}`);
        }

        // Create customer record in database
        console.log(`💾 Creating customer record for MAG connection ${i}`);
        const { data: newCustomer, error: createError } = await supabaseClient
          .from('customers')
          .insert({
            reseller_id: resellerId,
            name: `${customerData.name} (Connection ${i})`,
            email: customerData.email,
            mac_address: uniqueMac,
            device_type: customerData.deviceType,
            plan_duration: customerData.planDuration,
            max_connections: 1, // Each MAG account has 1 connection
            current_connections: 0,
            connection_details: [],
            start_date: customerData.startDate,
            expiration_date: customerData.expirationDate,
            status: customerData.status,
            is_deactivated: customerData.isDeactivated,
            provider: reseller.provider || '8k',
            customer_group: customerGroupId, // Group all connections together
            connection_sequence: i
          })
          .select()
          .single();

        if (createError) {
          console.error(`Error creating customer record for MAG connection ${i}:`, createError);
          failedConnections.push({
            connectionNumber: i,
            error: createError.message,
            macAddress: uniqueMac
          });
          continue;
        }

        createdCustomers.push({
          ...newCustomer,
          credentials: {
            macAddress: uniqueMac,
            bouquet: customerData.packageId,
            expiryTimestamp: expiryTimestamp
          }
        });

        console.log(`✅ Successfully created MAG connection ${i} with MAC: ${uniqueMac}`);

      } catch (error) {
        console.error(`❌ Failed to create MAG connection ${i}:`, error);
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
          notes: `Created ${createdCustomers.length} MAG accounts with 1 connection each (${customerData.planDuration} month${customerData.planDuration > 1 ? 's' : ''}) - Group: ${customerGroupId}`
        });

      if (logError) {
        console.error('Error logging credit transaction:', logError);
      }
    }

    const totalCreated = createdCustomers.length;
    const totalFailed = failedConnections.length;

    console.log(`✅ MAG multi-connection creation complete: ${totalCreated} created, ${totalFailed} failed`);

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
        message: `MAG accounts created successfully for ${totalCreated} connections`,
        creditsUsed: totalCreated > 0 ? creditsRequired : 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-mag-user function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
