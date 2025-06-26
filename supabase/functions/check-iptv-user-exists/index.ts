
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckUserRequest {
  username: string;
  password: string;
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

    const { username, password, resellerId }: CheckUserRequest = await req.json();

    console.log(`🔍 Checking if user exists: ${username} for reseller: ${resellerId}`);

    // Get reseller's profile to determine provider
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('provider')
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

    let userExists = false;
    let apiResponse = null;
    let expirationDate = null;

    // Check user existence based on provider
    if (provider === '8k') {
      console.log(`📡 Checking 8K user: ${username}`);
      
      const checkUrl = new URL(panelUrl);
      checkUrl.searchParams.append("action", "device_info");
      checkUrl.searchParams.append("username", username);
      checkUrl.searchParams.append("password", password);
      checkUrl.searchParams.append("api_key", iptvApiKey);

      console.log(`🔗 8K User Check API URL: ${checkUrl.toString().replace(iptvApiKey, '[REDACTED]').replace(password, '[REDACTED]')}`);

      const iptvResponse = await fetch(checkUrl.toString());
      apiResponse = await iptvResponse.json();

      console.log('8K API Response:', apiResponse);

      // For 8K provider, check if the response indicates success
      userExists = iptvResponse.ok && 
                   apiResponse && 
                   apiResponse.status === 'success' &&
                   apiResponse.result &&
                   typeof apiResponse.result === 'object';

      // Extract expiration date from 8K API response
      if (userExists && apiResponse.result) {
        // 8K API typically returns expire_date as timestamp
        if (apiResponse.result.expire_date) {
          const expTimestamp = parseInt(apiResponse.result.expire_date);
          if (!isNaN(expTimestamp)) {
            expirationDate = new Date(expTimestamp * 1000).toISOString().split('T')[0];
            console.log(`📅 8K User expiration date: ${expirationDate}`);
          }
        }
      }

    } else if (provider === 'trex') {
      console.log(`📡 Checking Trex user: ${username}`);
      
      // For Trex provider, use different API endpoint/format
      // This is a placeholder for Trex API - adjust based on actual Trex API documentation
      const checkUrl = new URL('https://trex-api-endpoint.com/check-user'); // Replace with actual Trex endpoint
      checkUrl.searchParams.append("api_key", iptvApiKey);
      checkUrl.searchParams.append("username", username);
      checkUrl.searchParams.append("password", password);

      console.log(`🔗 Trex User Check API URL: ${checkUrl.toString().replace(iptvApiKey, '[REDACTED]').replace(password, '[REDACTED]')}`);

      try {
        const trexResponse = await fetch(checkUrl.toString());
        apiResponse = await trexResponse.json();
        
        console.log('Trex API Response:', apiResponse);
        
        // Adjust this based on actual Trex API response format
        userExists = trexResponse.ok && apiResponse && apiResponse.exists === true;
        
        // Extract expiration date from Trex API response
        if (userExists && apiResponse.expiration_date) {
          expirationDate = apiResponse.expiration_date;
          console.log(`📅 Trex User expiration date: ${expirationDate}`);
        }
      } catch (error) {
        console.error('Trex API error:', error);
        userExists = false;
        apiResponse = { error: 'Failed to check Trex user' };
      }

    } else if (provider === 'mag') {
      console.log(`📡 Checking MAG user: ${username}`);
      
      // For MAG provider, use different API endpoint/format
      // This is a placeholder for MAG API - adjust based on actual MAG API documentation
      const checkUrl = new URL('https://mag-api-endpoint.com/check-user'); // Replace with actual MAG endpoint
      checkUrl.searchParams.append("api_key", iptvApiKey);
      checkUrl.searchParams.append("username", username);
      checkUrl.searchParams.append("password", password);

      console.log(`🔗 MAG User Check API URL: ${checkUrl.toString().replace(iptvApiKey, '[REDACTED]').replace(password, '[REDACTED]')}`);

      try {
        const magResponse = await fetch(checkUrl.toString());
        apiResponse = await magResponse.json();
        
        console.log('MAG API Response:', apiResponse);
        
        // Adjust this based on actual MAG API response format
        userExists = magResponse.ok && apiResponse && apiResponse.user_exists === true;
        
        // Extract expiration date from MAG API response
        if (userExists && apiResponse.expiration_date) {
          expirationDate = apiResponse.expiration_date;
          console.log(`📅 MAG User expiration date: ${expirationDate}`);
        }
      } catch (error) {
        console.error('MAG API error:', error);
        userExists = false;
        apiResponse = { error: 'Failed to check MAG user' };
      }

    } else {
      console.error(`❌ Unsupported provider: ${provider}`);
      return new Response(
        JSON.stringify({ 
          error: `Unsupported provider: ${provider}`,
          exists: false,
          username: username
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ User ${username} exists: ${userExists} (Provider: ${provider})`);

    return new Response(
      JSON.stringify({ 
        exists: userExists,
        username: username,
        provider: provider,
        expirationDate: expirationDate,
        message: userExists ? `User found in ${provider.toUpperCase()} panel` : `User not found in ${provider.toUpperCase()} panel`,
        apiResponse: apiResponse
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-iptv-user-exists function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        exists: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
