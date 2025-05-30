
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenewRequest {
  customerId: string;
  planDuration: number;
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

    const { customerId, planDuration }: RenewRequest = await req.json();

    console.log(`🔄 Starting renewal process for customer: ${customerId}, duration: ${planDuration} months`);

    // Validate plan duration
    if (![1, 3, 6, 12].includes(planDuration)) {
      console.error(`❌ Invalid plan duration: ${planDuration}. Must be 1, 3, 6, or 12 months.`);
      return new Response(
        JSON.stringify({ error: 'Invalid plan duration. Must be 1, 3, 6, or 12 months.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get customer details including their IPTV credentials
    const { data: customer, error: customerError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      console.error('Customer not found:', customerError);
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if customer has IPTV credentials
    if (!customer.username || !customer.password) {
      console.error(`❌ Customer ${customer.name} does not have IPTV credentials`);
      return new Response(
        JSON.stringify({ error: 'Customer does not have IPTV credentials. Please create IPTV account first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has permission to renew this customer
    if (customer.reseller_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized to renew this customer' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get reseller credits
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (resellerError || !reseller) {
      console.error('Reseller not found:', resellerError);
      return new Response(
        JSON.stringify({ error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if reseller has enough credits
    if (reseller.credits < planDuration) {
      console.log(`❌ Insufficient credits. Required: ${planDuration}, Available: ${reseller.credits}`);
      return new Response(
        JSON.stringify({ error: 'Insufficient credits', required: planDuration, available: reseller.credits }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get IPTV panel credentials from Supabase secrets
    const iptvApiKey = Deno.env.get('IPTV_API_KEY');
    const panelUrl = Deno.env.get('IPTV_PANEL_URL') || 'https://my8k.me/player_api.php';

    if (!iptvApiKey) {
      console.error('IPTV API key not configured in secrets');
      return new Response(
        JSON.stringify({ error: 'IPTV credentials not configured. Please contact administrator.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the API key (assuming format: username:password)
    const [iptvUsername, iptvPassword] = iptvApiKey.split(':');
    
    if (!iptvUsername || !iptvPassword) {
      console.error('IPTV API key format invalid. Expected format: username:password');
      return new Response(
        JSON.stringify({ error: 'IPTV credentials format invalid. Please contact administrator.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call IPTV panel to renew user using customer's credentials
    console.log(`📡 Calling IPTV panel to renew customer: ${customer.username} for ${planDuration} months`);
    
    const newExpiryDate = new Date();
    newExpiryDate.setMonth(newExpiryDate.getMonth() + planDuration);
    const unixTimestamp = Math.floor(newExpiryDate.getTime() / 1000);
    
    const renewUrl = new URL(panelUrl);
    renewUrl.searchParams.append("username", iptvUsername);
    renewUrl.searchParams.append("password", iptvPassword);
    renewUrl.searchParams.append("action", "user_edit");
    renewUrl.searchParams.append("user_username", customer.username); // Customer's IPTV username
    renewUrl.searchParams.append("user_expire", unixTimestamp.toString());

    console.log(`🔗 Renewal API URL: ${renewUrl.toString().replace(iptvPassword, '[REDACTED]')}`);
    console.log(`👤 Renewing customer username: ${customer.username}`);
    console.log(`📅 New expiry timestamp: ${unixTimestamp} (${newExpiryDate.toISOString()})`);

    const iptvResponse = await fetch(renewUrl.toString());
    const iptvData = await iptvResponse.json();

    console.log('IPTV API Response:', iptvData);

    if (!iptvResponse.ok || iptvData.error) {
      console.error('Failed to renew IPTV user:', iptvData);
      return new Response(
        JSON.stringify({ error: 'Failed to renew IPTV subscription', details: iptvData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate new expiration date for database
    const currentExpiration = new Date(customer.expiration_date);
    const newDatabaseExpiration = new Date(currentExpiration);
    newDatabaseExpiration.setMonth(newDatabaseExpiration.getMonth() + planDuration);
    
    // Update customer in database
    const { error: updateError } = await supabaseClient
      .from('customers')
      .update({ 
        expiration_date: newDatabaseExpiration.toISOString().split('T')[0],
        plan_duration: planDuration,
        status: 'active' // Reset status to active after renewal
      })
      .eq('id', customerId);

    if (updateError) {
      console.error('Failed to update customer:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update customer record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct credits from reseller
    const { error: creditError } = await supabaseClient
      .from('profiles')
      .update({ credits: reseller.credits - planDuration })
      .eq('id', user.id);

    if (creditError) {
      console.error('Failed to deduct credits:', creditError);
      // Note: Customer was already renewed, this is a warning
    }

    // Log the credit usage
    const { error: logError } = await supabaseClient
      .from('credit_logs')
      .insert({
        reseller_id: user.id,
        action: 'account_creation', // Using existing enum value for renewal
        credits_used: planDuration,
        customer_name: customer.name,
        customer_id: customerId,
        notes: `Subscription renewed for ${planDuration} ${planDuration === 1 ? 'month' : 'months'}`
      });

    if (logError) {
      console.error('Failed to log credit usage:', logError);
      // Non-critical error, continue
    }

    console.log(`✅ Successfully renewed customer ${customer.name} (${customer.username}) for ${planDuration} months`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Customer renewed for ${planDuration} ${planDuration === 1 ? 'month' : 'months'}`,
        newExpirationDate: newDatabaseExpiration.toISOString().split('T')[0]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in renew-iptv-user function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
