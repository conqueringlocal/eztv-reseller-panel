
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

// Helper function to map plan duration to subscription format (same as create-trex-user)
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

    console.log(`🔄 Starting Trex renewal process for customer: ${customerId}, duration: ${planDuration} months`);

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
    // This function only handles the Trex API call and database update

    // Get Trex panel credentials from Supabase secrets
    const trexApiKey = Deno.env.get('TREX_API_KEY');
    const panelUrl = Deno.env.get('TREX_PANEL_URL') || 'https://trex.example.com/api/api.php';

    if (!trexApiKey) {
      console.error('Trex API key not configured in secrets');
      return new Response(
        JSON.stringify({ error: 'Trex API key not configured. Please contact administrator.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map plan duration to subscription format (to match create-trex-user behavior)
    const subscriptionPeriod = mapPlanDurationToSub(planDuration);
    
    // Call Trex panel to renew user using correct API parameters as per specification
    console.log(`📡 Calling Trex panel to renew customer: ${customer.username} for ${planDuration} months`);
    console.log(`📅 Mapped subscription period: ${subscriptionPeriod} (from ${planDuration} months)`);
    
    const renewUrl = new URL(panelUrl);
    renewUrl.searchParams.append("api_key", trexApiKey);
    renewUrl.searchParams.append("action", "renew");
    renewUrl.searchParams.append("type", "m3u");
    renewUrl.searchParams.append("username", customer.username);
    renewUrl.searchParams.append("password", customer.password);
    renewUrl.searchParams.append("sub", subscriptionPeriod);

    console.log(`🔗 Trex renewal API URL: ${renewUrl.toString().replace(trexApiKey, '[REDACTED]')}`);
    console.log(`👤 Renewing customer username: ${customer.username}`);
    console.log(`📅 Subscription duration: ${planDuration} months`);

    const trexResponse = await fetch(renewUrl.toString());
    const trexData = await trexResponse.json();

    console.log('Trex API Response:', trexData);

    // Check if the response indicates success
    if (!trexResponse.ok || trexData.error || trexData.status === 'error') {
      console.error('Failed to renew Trex user:', trexData);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to renew Trex subscription', 
          details: trexData,
          trexResponse: trexData 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTE: This function ONLY handles the Trex API call
    // Database updates and credit deduction are handled by renew-customer-group function

    console.log(`✅ Successfully renewed Trex customer ${customer.name} (${customer.username}) for ${planDuration} months via API`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Trex API renewal successful for ${planDuration} ${planDuration === 1 ? 'month' : 'months'}`,
        provider: 'trex',
        customerName: customer.name,
        username: customer.username
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in renew-trex-user function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
