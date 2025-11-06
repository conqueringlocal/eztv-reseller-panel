
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

    // Note: Credit checking and deduction is now handled by renew-customer-group function
    // This function only handles the IPTV API call and database update

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

    // Call IPTV panel to renew user using correct API parameters as per specification
    console.log(`📡 Calling IPTV panel to renew customer: ${customer.username} for ${planDuration} months`);
    
    const renewUrl = new URL(panelUrl);
    renewUrl.searchParams.append("api_key", iptvApiKey);
    renewUrl.searchParams.append("action", "renew");
    renewUrl.searchParams.append("type", "m3u");
    renewUrl.searchParams.append("username", customer.username);
    renewUrl.searchParams.append("password", customer.password);
    renewUrl.searchParams.append("sub", planDuration.toString());

    console.log(`🔗 Renewal API URL: ${renewUrl.toString().replace(iptvApiKey, '[REDACTED]')}`);
    console.log(`👤 Renewing customer username: ${customer.username}`);
    console.log(`📅 Subscription duration: ${planDuration} months`);

    const iptvResponse = await fetch(renewUrl.toString());
    const iptvData = await iptvResponse.json();

    console.log('IPTV API Response:', iptvData);

    // Check if the response indicates success
    if (!iptvResponse.ok || iptvData.error || iptvData.status === 'error') {
      console.error('Failed to renew IPTV user:', iptvData);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to renew IPTV subscription', 
          details: iptvData,
          iptvResponse: iptvData 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTE: This function ONLY handles the IPTV API call
    // Database updates and credit deduction are handled by renew-customer-group function

    console.log(`✅ Successfully renewed IPTV customer ${customer.name} (${customer.username}) for ${planDuration} months via API`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `IPTV API renewal successful for ${planDuration} ${planDuration === 1 ? 'month' : 'months'}`,
        provider: 'iptv',
        customerName: customer.name,
        username: customer.username
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
