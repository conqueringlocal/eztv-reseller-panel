
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

    // Log API key format for debugging
    console.log('🔑 API key format check:');
    console.log('- API key length:', apiKey.length);
    console.log('- API key ending:', apiKey.slice(-8));
    console.log('- Starts with eyJ (JWT):', apiKey.startsWith('eyJ'));
    console.log('📍 Location ID:', locationId);

    // Create contact in HighLevel using the correct API endpoint
    console.log('🔄 Creating contact in HighLevel...');
    
    const contactPayload = {
      firstName: customerName.split(' ')[0] || customerName,
      lastName: customerName.split(' ').slice(1).join(' ') || '',
      email: customerEmail,
      locationId: locationId,
      source: 'IPTV Customer Creation'
    };

    console.log('📤 Contact payload:', contactPayload);

    // Use the correct HighLevel API v2 endpoint
    const apiUrl = `https://services.leadconnectorhq.com/contacts/`;
    console.log('🌐 API URL:', apiUrl);

    // Prepare headers with proper authorization
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    };

    console.log('📡 Request headers (without auth token):', {
      'Content-Type': headers['Content-Type'],
      'Version': headers['Version'],
      'Authorization': `Bearer ${apiKey.slice(0, 10)}...${apiKey.slice(-10)}`
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(contactPayload)
    });

    const responseText = await response.text();
    console.log('📡 HighLevel API response status:', response.status);
    console.log('📡 HighLevel API response headers:', Object.fromEntries(response.headers.entries()));
    console.log('📡 HighLevel API response body:', responseText);

    if (!response.ok) {
      console.error('❌ HighLevel API error details:');
      console.error('- Status:', response.status);
      console.error('- Status Text:', response.statusText);
      console.error('- Response:', responseText);
      
      // Parse error response if possible
      let errorDetails = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetails = errorJson.message || errorJson.error || responseText;
        console.error('- Parsed error:', errorDetails);
      } catch (e) {
        console.error('- Could not parse error response as JSON');
      }

      // Handle specific error cases with detailed messages
      if (response.status === 401) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'HighLevel API authentication failed. The API key may be invalid, expired, or not properly formatted.',
          details: `Authentication error: ${errorDetails}`,
          troubleshooting: {
            apiKeyFormat: apiKey.startsWith('eyJ') ? 'JWT format' : 'Bearer token format',
            apiKeyLength: apiKey.length,
            endpoint: apiUrl,
            suggestion: 'Please verify your HighLevel API key is valid and has the correct permissions for creating contacts.'
          }
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (response.status === 403) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'HighLevel API access forbidden. The API key may not have permission to create contacts.',
          details: errorDetails,
          troubleshooting: {
            suggestion: 'Check that your HighLevel API key has the necessary permissions for contact creation.'
          }
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (response.status === 422) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'HighLevel API validation error. The contact data may be invalid.',
          details: errorDetails,
          troubleshooting: {
            payload: contactPayload,
            suggestion: 'Check that the contact data meets HighLevel\'s validation requirements.'
          }
        }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: `HighLevel API error: ${response.status} ${response.statusText}`,
        details: errorDetails,
        troubleshooting: {
          httpStatus: response.status,
          endpoint: apiUrl,
          suggestion: 'Check HighLevel API documentation for this error code.'
        }
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

    // Extract contact ID from response
    const contactId = result.contact?.id || result.id;
    
    if (!contactId) {
      console.error('❌ No contact ID returned from HighLevel');
      console.error('Full response:', result);
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
      message: 'Contact created successfully in HighLevel',
      debugInfo: {
        apiEndpoint: apiUrl,
        responseStatus: response.status,
        contactData: result.contact || result
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in HighLevel contact creation function:', error);
    console.error('Error stack:', error.stack);
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
