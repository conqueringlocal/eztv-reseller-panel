import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { customerId } = await req.json();

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'Customer ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Syncing device info for customer:', customerId);

    // Fetch customer data
    const { data: customer, error: customerError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      console.error('Customer fetch error:', customerError);
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Customer data:', { 
      provider: customer.provider, 
      deviceType: customer.device_type,
      username: customer.username,
      macAddress: customer.mac_address 
    });

    // Get provider credentials
    let apiKey: string | undefined;
    let panelUrl: string | undefined;

    switch (customer.provider) {
      case 'trex':
        apiKey = Deno.env.get('TREX_API_KEY');
        panelUrl = Deno.env.get('TREX_PANEL_URL');
        break;
      case '8k':
        apiKey = Deno.env.get('8K_API_KEY');
        panelUrl = Deno.env.get('8K_PANEL_URL');
        break;
      default:
        apiKey = Deno.env.get('IPTV_API_KEY');
        panelUrl = Deno.env.get('IPTV_PANEL_URL');
        break;
    }

    if (!apiKey || !panelUrl) {
      console.error('Missing provider credentials for:', customer.provider);
      return new Response(
        JSON.stringify({ error: `Provider credentials not configured for ${customer.provider}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine API call parameters based on available credentials
    let apiUrl: string;
    let deviceCategory: string;
    
    if (customer.username && customer.password) {
      // For M3U-based devices (any device type that uses username/password)
      deviceCategory = 'M3U-based';
      const m3uUrl = `${panelUrl}/get.php?username=${customer.username}&password=${customer.password}&type=m3u_plus`;
      apiUrl = `${panelUrl}/api/device?token=${apiKey}&info=${encodeURIComponent(m3uUrl)}`;
      console.log('Using M3U-based sync for device type:', customer.device_type);
    } else if (customer.mac_address) {
      // For MAC/MAG devices (any device type that uses MAC address)
      deviceCategory = 'MAC-based';
      apiUrl = `${panelUrl}/api/device?token=${apiKey}&info=${customer.mac_address}`;
      console.log('Using MAC-based sync for device type:', customer.device_type);
    } else {
      console.error('Insufficient device credentials for sync:', { 
        deviceType: customer.device_type, 
        hasUsername: !!customer.username, 
        hasPassword: !!customer.password,
        hasMac: !!customer.mac_address 
      });
      return new Response(
        JSON.stringify({ 
          error: 'Device sync requires either username/password credentials or MAC address',
          deviceType: customer.device_type,
          availableCredentials: {
            hasUsername: !!customer.username,
            hasPassword: !!customer.password,
            hasMacAddress: !!customer.mac_address
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Making API call to:', apiUrl.replace(apiKey, '[REDACTED]'));

    // Make API call to IPTV panel
    const response = await fetch(apiUrl);
    const data = await response.json();

    console.log('API response:', data);

    if (!response.ok || data.status !== 'success') {
      console.error('API error:', data);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch device info from panel' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { expire, url } = data.data;

    // Update customer data in database
    const updates: any = {};
    if (expire) {
      updates.expiration_date = expire;
    }
    if (url) {
      updates.m3u_url = url;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ message: 'No updates needed', data: data.data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateError } = await supabaseClient
      .from('customers')
      .update(updates)
      .eq('id', customerId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update customer data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully updated customer:', customerId, updates);

    return new Response(
      JSON.stringify({ 
        message: 'Device info synced successfully', 
        updates,
        panelData: data.data 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync device info error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});