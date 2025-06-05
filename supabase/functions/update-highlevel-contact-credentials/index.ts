
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateCredentialsRequest {
  contactId: string;
  resellerId: string;
  iptvCredentials: {
    username: string;
    password: string;
    m3uUrl?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔄 HighLevel contact credentials update function called');

    const { 
      contactId, 
      resellerId,
      iptvCredentials
    }: UpdateCredentialsRequest = await req.json();

    console.log('📋 Update request:', { contactId, resellerId, hasCredentials: !!iptvCredentials });

    if (!contactId || !resellerId || !iptvCredentials) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: contactId, resellerId, and iptvCredentials are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get reseller's HighLevel settings
    console.log('🔍 Fetching reseller HighLevel settings...');
    
    const { data: hlSettings, error: hlError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_id, location_api_key')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (hlError || !hlSettings) {
      console.error('❌ No HighLevel settings found for reseller:', resellerId, hlError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel integration not configured for this reseller',
        details: hlError?.message || 'No active HighLevel settings found'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!hlSettings.location_api_key) {
      console.error('❌ No Location API Key configured for reseller:', resellerId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel Location API Key not configured for this reseller',
        details: 'Please configure the Location API Key in your HighLevel settings'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const locationApiKey = hlSettings.location_api_key;
    const locationId = hlSettings.location_id;

    console.log('🔐 Using Location API credentials for update');

    // Prepare custom field values for IPTV credentials
    const customField: any[] = [];
    
    if (iptvCredentials.username) {
      customField.push({
        id: 'iptv_username',
        field_value: iptvCredentials.username
      });
    }
    
    if (iptvCredentials.password) {
      customField.push({
        id: 'iptv_password', 
        field_value: iptvCredentials.password
      });
    }
    
    if (iptvCredentials.m3uUrl) {
      customField.push({
        id: 'iptv_m3u_url',
        field_value: iptvCredentials.m3uUrl
      });
    }

    // Update contact in HighLevel
    console.log('🔄 Updating contact credentials in HighLevel...');
    
    const updatePayload = {
      customField: customField
    };

    console.log('📤 Update payload:', updatePayload);

    const apiUrl = `https://rest.gohighlevel.com/v1/contacts/${contactId}`;
    console.log('🌐 API URL:', apiUrl);

    const headers = {
      'Authorization': `Bearer ${locationApiKey}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(updatePayload)
    });

    const responseText = await response.text();
    console.log('📡 HighLevel API response status:', response.status);
    console.log('📡 HighLevel API response body:', responseText);

    if (!response.ok) {
      console.error('❌ HighLevel API error details:');
      console.error('- Status:', response.status);
      console.error('- Response:', responseText);
      
      let errorDetails = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetails = errorJson.message || errorJson.error || responseText;
      } catch (e) {
        console.error('- Could not parse error response as JSON');
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: `HighLevel API error: ${response.status} ${response.statusText}`,
        details: errorDetails,
        troubleshooting: 'Please check your HighLevel Location API Key and contact ID'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;
    try {
      result = JSON.parse(responseText);
      console.log('✅ Contact credentials updated successfully in HighLevel:', result);
    } catch (e) {
      console.error('❌ Failed to parse HighLevel response as JSON:', e);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid response format from HighLevel API',
        details: responseText
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🎉 Contact credentials update successful');

    return new Response(JSON.stringify({ 
      success: true, 
      contactId: contactId,
      message: 'Contact credentials updated successfully in HighLevel',
      credentialsUpdated: customField.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in HighLevel contact credentials update function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : 'No additional details available'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
