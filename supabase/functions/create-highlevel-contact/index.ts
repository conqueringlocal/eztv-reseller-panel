
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateContactRequest {
  customerName: string;
  customerEmail: string;
  resellerId: string;
  apiKey?: string;
  locationId?: string;
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
      resellerId,
      apiKey: providedApiKey,
      locationId: providedLocationId
    }: CreateContactRequest = await req.json();

    console.log('📋 Request data:', { customerName, customerEmail, resellerId });

    // Get reseller's HighLevel credentials from database
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let apiKey = providedApiKey;
    let locationId = providedLocationId;

    // If credentials not provided in request, fetch from database
    if (!apiKey || !locationId) {
      console.log('🔍 Fetching HighLevel credentials from database...');
      
      const { data: hlSettings, error: hlError } = await supabase
        .from('reseller_highlevel_settings')
        .select('api_key, location_id')
        .eq('reseller_id', resellerId)
        .eq('is_active', true)
        .single();

      if (hlError || !hlSettings) {
        console.error('❌ No HighLevel settings found for reseller:', resellerId, hlError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'HighLevel credentials not configured for this reseller' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      apiKey = hlSettings.api_key;
      locationId = hlSettings.location_id;
    }

    if (!apiKey || !locationId) {
      console.error('❌ Missing HighLevel API credentials');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel API credentials not provided' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create contact in HighLevel
    console.log('🔄 Creating contact in HighLevel...');
    console.log('🔑 Using API key ending in:', apiKey.slice(-8));
    console.log('📍 Using location ID:', locationId);
    
    const contactPayload = {
      firstName: customerName.split(' ')[0] || customerName,
      lastName: customerName.split(' ').slice(1).join(' ') || '',
      email: customerEmail,
      locationId: locationId,
      source: 'IPTV Customer Creation'
    };

    console.log('📤 Contact payload:', contactPayload);

    const response = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify(contactPayload)
    });

    const responseText = await response.text();
    console.log('📡 HighLevel API response status:', response.status);
    console.log('📡 HighLevel API response:', responseText);

    if (!response.ok) {
      console.error('❌ HighLevel API error:', response.status, responseText);
      
      // Handle specific error cases
      if (response.status === 401) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid HighLevel API credentials. Please check your API key and try again.',
          details: 'Authentication failed - the API key may be expired or invalid'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: `HighLevel API error: ${response.status}`,
        details: responseText
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = JSON.parse(responseText);
    console.log('✅ Contact created successfully in HighLevel:', result);

    const contactId = result.contact?.id || result.id;
    
    if (!contactId) {
      console.error('❌ No contact ID returned from HighLevel');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Contact created but no ID returned' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
