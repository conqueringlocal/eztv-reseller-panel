
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateContactRequest {
  customerName: string;
  customerEmail: string;
  resellerId: string;
  apiKey: string;
  locationId: string;
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
      apiKey,
      locationId
    }: CreateContactRequest = await req.json();

    console.log('📋 Request data:', { customerName, customerEmail, resellerId });

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HighLevel API error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `HighLevel API error: ${response.status}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    console.log('✅ Contact created successfully in HighLevel:', result);

    return new Response(JSON.stringify({ 
      success: true, 
      contactId: result.contact?.id || result.id,
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
