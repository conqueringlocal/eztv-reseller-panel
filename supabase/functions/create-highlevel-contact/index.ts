
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateContactRequest {
  customerName: string;
  customerEmail: string;
  resellerId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📞 HighLevel contact creation function called');

    const { 
      customerName, 
      customerEmail, 
      resellerId
    }: CreateContactRequest = await req.json();

    console.log('📋 Request data:', { customerName, customerEmail, resellerId });

    // Get Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get reseller's location ID from settings
    console.log('🔍 Fetching reseller HighLevel settings...');
    
    const { data: hlSettings, error: hlError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_id')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (hlError || !hlSettings) {
      console.error('❌ No HighLevel settings found for reseller:', resellerId, hlError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel integration not configured for this reseller' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the global Agency API Key from system settings
    console.log('🔑 Fetching global Agency API Key...');
    
    const { data: systemSettings, error: systemError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('id', 'highlevel_agency_api_key')
      .single();

    if (systemError || !systemSettings?.value) {
      console.error('❌ No global HighLevel Agency API Key found:', systemError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel Agency API Key not configured at system level' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agencyApiKey = systemSettings.value;
    const locationId = hlSettings.location_id;

    console.log('🔐 Using global Agency API credentials:', {
      hasApiKey: !!agencyApiKey,
      apiKeyLength: agencyApiKey?.length || 0,
      locationId: locationId
    });

    // Create contact in HighLevel using the v1 API endpoint
    console.log('🔄 Creating contact in HighLevel...');
    
    const contactPayload = {
      firstName: customerName.split(' ')[0] || customerName,
      lastName: customerName.split(' ').slice(1).join(' ') || '',
      email: customerEmail,
      locationId: locationId,
      source: 'IPTV Customer Creation'
    };

    console.log('📤 Contact payload:', contactPayload);

    const apiUrl = `https://rest.gohighlevel.com/v1/contacts/`;
    console.log('🌐 API URL:', apiUrl);

    const headers = {
      'Authorization': `Bearer ${agencyApiKey}`,
      'Content-Type': 'application/json'
    };

    console.log('📡 Request headers (redacted):', {
      'Content-Type': headers['Content-Type'],
      'Authorization': `Bearer ${agencyApiKey.slice(0, 10)}...`
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(contactPayload)
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

      if (response.status === 401) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'HighLevel API authentication failed. The Agency API Key may be invalid or expired.',
          details: `Authentication error: ${errorDetails}`
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (response.status === 403) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'HighLevel API access forbidden. The Agency API Key may not have permission to access this location.',
          details: errorDetails
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: `HighLevel API error: ${response.status} ${response.statusText}`,
        details: errorDetails
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;
    try {
      result = JSON.parse(responseText);
      console.log('✅ Contact created successfully in HighLevel:', result);
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

    const contactId = result.contact?.id || result.id;
    
    if (!contactId) {
      console.error('❌ No contact ID returned from HighLevel');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Contact creation succeeded but no contact ID was returned',
        details: result
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🎉 Contact creation successful - Contact ID:', contactId);

    return new Response(JSON.stringify({ 
      success: true, 
      contactId: contactId,
      message: 'Contact created successfully in HighLevel'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in HighLevel contact creation function:', error);
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
