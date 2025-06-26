
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateUserRequest {
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
    currentConnections?: number;
    connectionDetails?: any[];
    startDate: string;
    expirationDate: string;
    accountType: 'm3u' | 'mag';
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

    const { resellerId, customerData }: CreateUserRequest = await req.json();

    console.log(`🚀 Creating M3U user for reseller: ${resellerId}`);
    console.log(`📊 Customer data:`, customerData);

    // Get reseller's profile to determine provider and check credits
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

    const provider = reseller.provider || '8k';
    console.log(`📱 Using provider: ${provider}`);

    // Calculate required credits using the database function
    const { data: creditsRequired, error: creditsError } = await supabaseClient.rpc('calculate_credits_required', {
      connections: customerData.maxConnections || customerData.connections,
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

    // Generate unique username and password
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000);
    const username = `${customerData.name.toLowerCase().replace(/\s+/g, '')}_${timestamp}_${randomNum}`.substring(0, 32);
    const password = `pass_${timestamp}_${randomNum}`;

    console.log(`🔐 Generated credentials - Username: ${username}`);

    // Create IPTV user based on provider
    let iptvResponse;
    let iptvResult;

    if (provider === '8k') {
      console.log(`📡 Creating 8K M3U user with ${customerData.maxConnections || customerData.connections} connections`);
      
      const createUrl = new URL(panelUrl);
      createUrl.searchParams.append("api_key", iptvApiKey);
      createUrl.searchParams.append("action", "user_create");
      createUrl.searchParams.append("username", username);
      createUrl.searchParams.append("password", password);
      createUrl.searchParams.append("package_id", customerData.packageId);
      createUrl.searchParams.append("duration", customerData.planDuration.toString());
      createUrl.searchParams.append("max_connections", (customerData.maxConnections || customerData.connections).toString());

      console.log(`🔗 8K Create API URL: ${createUrl.toString().replace(iptvApiKey, '[REDACTED]')}`);

      iptvResponse = await fetch(createUrl.toString());
      iptvResult = await iptvResponse.json();

      console.log('8K API Response:', iptvResult);

      if (!iptvResponse.ok || iptvResult.error) {
        throw new Error(iptvResult.error || 'Failed to create IPTV user');
      }

    } else if (provider === 'trex') {
      console.log(`📡 Creating Trex M3U user with ${customerData.maxConnections || customerData.connections} connections`);
      
      // Trex API implementation (placeholder - adjust based on actual Trex API)
      const createUrl = new URL('https://trex-api-endpoint.com/create-user');
      createUrl.searchParams.append("api_key", iptvApiKey);
      createUrl.searchParams.append("username", username);
      createUrl.searchParams.append("password", password);
      createUrl.searchParams.append("package", customerData.packageId);
      createUrl.searchParams.append("duration", customerData.planDuration.toString());
      createUrl.searchParams.append("connections", (customerData.maxConnections || customerData.connections).toString());

      iptvResponse = await fetch(createUrl.toString());
      iptvResult = await iptvResponse.json();

      if (!iptvResponse.ok || !iptvResult.success) {
        throw new Error(iptvResult.error || 'Failed to create Trex IPTV user');
      }

    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Create customer record in database with multi-connection support
    console.log(`💾 Creating customer record with multi-connection support`);
    const { data: newCustomer, error: createError } = await supabaseClient
      .from('customers')
      .insert({
        reseller_id: resellerId,
        name: customerData.name,
        email: customerData.email,
        username: username,
        password: password,
        mac_address: customerData.macAddress || null,
        device_type: customerData.deviceType,
        plan_duration: customerData.planDuration,
        max_connections: customerData.maxConnections || customerData.connections,
        current_connections: 0,
        connection_details: customerData.connectionDetails || [],
        start_date: customerData.startDate,
        expiration_date: customerData.expirationDate,
        status: customerData.status,
        is_deactivated: customerData.isDeactivated,
        provider: provider,
        customer_group_id: iptvResult.user_info?.group_id?.toString() || null,
        m3u_url: iptvResult.user_info?.m3u_url || null
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating customer record:', createError);
      // Try to cleanup the IPTV user if database insert failed
      // (Implementation depends on provider API)
      
      return new Response(
        JSON.stringify({ error: 'Failed to create customer record', details: createError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct credits from reseller
    console.log(`💳 Deducting ${creditsRequired} credits from reseller`);
    const { error: creditError } = await supabaseClient
      .from('profiles')
      .update({ credits: reseller.credits - creditsRequired })
      .eq('id', resellerId);

    if (creditError) {
      console.error('Error deducting credits:', creditError);
      // Customer was created but credits weren't deducted - log this for manual review
    }

    // Log the credit transaction with connection info
    const { error: logError } = await supabaseClient
      .from('credit_logs')
      .insert({
        reseller_id: resellerId,
        action: 'account_creation',
        credits_used: creditsRequired,
        connections_used: customerData.maxConnections || customerData.connections,
        customer_id: newCustomer.id,
        customer_name: customerData.name,
        notes: `Created M3U account with ${customerData.maxConnections || customerData.connections} connection${(customerData.maxConnections || customerData.connections) > 1 ? 's' : ''} (${customerData.planDuration} month${customerData.planDuration > 1 ? 's' : ''})`
      });

    if (logError) {
      console.error('Error logging credit transaction:', logError);
    }

    console.log(`✅ M3U customer created successfully: ${customerData.name}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        customer: newCustomer,
        credentials: {
          username: username,
          password: password,
          maxConnections: customerData.maxConnections || customerData.connections,
          m3uUrl: iptvResult.user_info?.m3u_url
        },
        provider: provider,
        creditsUsed: creditsRequired
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
