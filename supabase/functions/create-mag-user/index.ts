
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateMagUserRequest {
  userParams: {
    macAddress: string;
    maxConnections: number;
    expiryDate: string;
    isTrial: boolean;
    bouquet?: string;
    customerName: string;
    resellerName: string;
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

    const { userParams }: CreateMagUserRequest = await req.json();

    console.log(`🎯 Creating MAG user for customer: ${userParams.customerName}, MAC: ${userParams.macAddress}`);

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

    // Convert expiry date to Unix timestamp
    const expiryTimestamp = Math.floor(new Date(userParams.expiryDate).getTime() / 1000);

    // Call IPTV panel to create MAG user
    console.log(`📡 Calling IPTV panel to create MAG user for MAC: ${userParams.macAddress}`);
    
    const createUrl = new URL(panelUrl);
    createUrl.searchParams.append("api_key", iptvApiKey);
    createUrl.searchParams.append("action", "create");
    createUrl.searchParams.append("type", "mag");
    createUrl.searchParams.append("mac", userParams.macAddress);
    createUrl.searchParams.append("bouquet", userParams.bouquet || "1");
    createUrl.searchParams.append("mag_expire", expiryTimestamp.toString());
    createUrl.searchParams.append("is_trial", userParams.isTrial ? "1" : "0");

    console.log(`🔗 MAG Creation API URL: ${createUrl.toString().replace(iptvApiKey, '[REDACTED]')}`);
    console.log(`📦 MAC Address: ${userParams.macAddress}`);
    console.log(`📅 Expiry timestamp: ${expiryTimestamp}`);
    console.log(`🎫 Bouquet: ${userParams.bouquet || "1"}`);

    const iptvResponse = await fetch(createUrl.toString());
    const iptvData = await iptvResponse.json();

    console.log('IPTV API Response:', iptvData);

    // Check if the response indicates success
    if (!iptvResponse.ok || iptvData.error || iptvData.status === 'error') {
      console.error('Failed to create MAG user:', iptvData);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create MAG account', 
          details: iptvData,
          iptvResponse: iptvData 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract relevant information from IPTV response
    const magUser = {
      macAddress: userParams.macAddress,
      bouquet: userParams.bouquet || "1",
      expiryTimestamp: expiryTimestamp,
      // MAG devices don't have username/password like M3U
    };

    console.log(`✅ Successfully created MAG user for ${userParams.customerName} with MAC: ${userParams.macAddress}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: magUser,
        message: `MAG account created successfully for MAC: ${userParams.macAddress}`,
        iptvResponse: iptvData
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
