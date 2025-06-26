
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckUserRequest {
  username: string;
  resellerId: string;
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

    const { username, resellerId }: CheckUserRequest = await req.json();

    console.log(`🔍 Checking if user exists: ${username} for reseller: ${resellerId}`);

    // Get reseller's IPTV credentials
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', resellerId)
      .single();

    if (resellerError || !reseller) {
      console.error('Reseller not found:', resellerError);
      return new Response(
        JSON.stringify({ error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Check if user exists in IPTV panel
    console.log(`📡 Calling IPTV panel to check user: ${username}`);
    
    const checkUrl = new URL(panelUrl);
    checkUrl.searchParams.append("api_key", iptvApiKey);
    checkUrl.searchParams.append("action", "get");
    checkUrl.searchParams.append("username", username);

    console.log(`🔗 User Check API URL: ${checkUrl.toString().replace(iptvApiKey, '[REDACTED]')}`);

    const iptvResponse = await fetch(checkUrl.toString());
    const iptvData = await iptvResponse.json();

    console.log('IPTV API Response:', iptvData);

    // Check if the user exists based on the API response
    const userExists = iptvResponse.ok && 
                      iptvData && 
                      !iptvData.error && 
                      iptvData.status !== 'error' &&
                      iptvData.user_info;

    console.log(`✅ User ${username} exists: ${userExists}`);

    return new Response(
      JSON.stringify({ 
        exists: userExists,
        username: username,
        message: userExists ? 'User found in IPTV panel' : 'User not found in IPTV panel',
        iptvResponse: iptvData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-iptv-user-exists function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
