
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  contactId: string;
  customerName: string;
  username: string;
  password: string;
  m3uUrl?: string;
  resellerId: string;
  messageType?: 'SMS' | 'Email';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📨 HighLevel message function called');

    const { 
      contactId, 
      customerName, 
      username, 
      password, 
      m3uUrl, 
      resellerId,
      messageType = 'SMS' 
    }: SendMessageRequest = await req.json();

    console.log('📋 Request data:', { contactId, customerName, username, resellerId, messageType });

    // Get HighLevel API key and location ID from Supabase secrets
    const highLevelApiKey = Deno.env.get('HIGHLEVEL_API_KEY');
    const highLevelLocationId = Deno.env.get('HIGHLEVEL_LOCATION_ID');

    if (!highLevelApiKey || !highLevelLocationId) {
      console.error('❌ Missing HighLevel API credentials');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel API credentials not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format the credentials message
    const message = `🎉 Hi ${customerName}! Your IPTV account has been successfully created.

📺 Your Login Credentials:
• Username: ${username}
• Password: ${password}

${m3uUrl ? `🔗 M3U URL: ${m3uUrl}` : ''}

You can now enjoy your IPTV service! If you need any assistance, please don't hesitate to reach out.

Thank you for choosing our service! 🙏`;

    console.log('📝 Formatted message:', message);

    // Send message via HighLevel API
    const response = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${highLevelApiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify({
        type: messageType,
        contactId: contactId,
        message: message,
        locationId: highLevelLocationId
      })
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
    console.log('✅ Message sent successfully via HighLevel:', result);

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: result.messageId || result.id,
      message: 'Credentials sent successfully via HighLevel'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in HighLevel message function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
