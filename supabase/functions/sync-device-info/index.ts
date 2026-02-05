import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// M3U streaming domain for Trex provider
const TREX_M3U_DOMAIN = 'vpn.eztvclub.online';

// Helper to fix malformed M3U URLs from provider
function fixM3uUrl(url: string | undefined, username: string, password: string, provider: string): string | undefined {
  if (!username || !password) return url;
  
  // For Trex provider, always construct correct URL
  if (provider === 'trex') {
    return `http://${TREX_M3U_DOMAIN}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
  }
  
  // For other providers, check if URL is malformed (starts with http:///)
  if (url && url.startsWith('http:///')) {
    // URL is malformed - return undefined so it won't be used
    return undefined;
  }
  
  return url;
}

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
      password: customer.password ? '[REDACTED]' : null,
      passwordLength: customer.password ? customer.password.length : 0,
      passwordType: typeof customer.password,
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

    // Check if this is a consolidated customer with multiple connections
    const connectionList = customer.connection_list || [];
    const hasMultipleConnections = Array.isArray(connectionList) && connectionList.length > 0;

    console.log('Connection info:', {
      hasMultipleConnections,
      connectionCount: connectionList.length,
      totalConnections: customer.total_connections
    });

    // If multiple connections exist, sync all of them
    if (hasMultipleConnections) {
      console.log('Syncing multiple connections...');
      
      const syncResults = [];
      const updatedConnectionList = [];
      
      // Helper function to sync a connection
      const syncConnection = async (creds: any, connNum: number) => {
        const hasUser = creds.username?.trim().length > 0;
        const hasPass = creds.password?.trim().length > 0;
        const hasMac = creds.mac_address?.trim().length > 0;
        
        if (!hasUser && !hasPass && !hasMac) {
          return { success: false, error: 'No valid credentials', connectionNumber: connNum };
        }
        
        let url = `${panelUrl}?action=device_info&api_key=${apiKey}`;
        if (hasUser && hasPass) {
          url += `&username=${creds.username}&password=${creds.password}`;
        } else if (hasMac) {
          url += `&mac=${creds.mac_address}`;
        }
        
        try {
          const res = await fetch(url);
          const dat = await res.json();
          console.log('Connection sync response:', { connectionNumber: connNum, status: dat.status, hasUserInfo: !!dat.user_info });
          
          // Check for various success status formats (providers return different formats)
          const isSuccess = res.ok && (dat.status === 'true' || dat.status === true || dat.status === 'success' || dat.user_info);
          if (!isSuccess) {
            console.log('Connection sync failed:', { status: dat.status, error: dat.error || dat.message });
            return { success: false, error: dat.error || dat.message || 'API error', connectionNumber: connNum };
          }
          
          return {
            success: true,
            expire: dat.user_info?.exp_date || dat.expire,
            m3uUrl: fixM3uUrl(dat.user_info?.url || dat.url, creds.username, creds.password, customer.provider),
            connectionNumber: connNum
          };
        } catch (err: any) {
          return { success: false, error: err.message, connectionNumber: connNum };
        }
      };
      
      // Sync primary connection
      const primaryResult = await syncConnection(
        { username: customer.username, password: customer.password, mac_address: customer.mac_address },
        1
      );
      syncResults.push(primaryResult);
      
      // Sync each connection in list
      for (let i = 0; i < connectionList.length; i++) {
        const conn = connectionList[i];
        const result = await syncConnection(
          { username: conn.username, password: conn.password, mac_address: conn.macAddress || conn.mac_address },
          conn.connection_number || conn.connectionNumber || (i + 2)
        );
        
        updatedConnectionList.push({
          ...conn,
          expiration_date: result.expire || conn.expiration_date || conn.expirationDate,
          m3u_url: result.m3uUrl || conn.m3u_url || conn.m3uUrl
        });
        
        syncResults.push(result);
      }
      
      // Find earliest expiration
      const validExpirations = syncResults
        .filter(r => r.success && r.expire)
        .map(r => new Date(r.expire));
      
      let earliestExpiration;
      if (validExpirations.length > 0) {
        earliestExpiration = new Date(Math.min(...validExpirations.map(d => d.getTime())));
      }
      
      // Update database
      const updates: any = { connection_list: updatedConnectionList };
      
      if (earliestExpiration) {
        updates.expiration_date = earliestExpiration.toISOString().split('T')[0];
      }
      
      if (primaryResult.success && primaryResult.m3uUrl) {
        updates.m3u_url = primaryResult.m3uUrl;
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
      
      console.log('Successfully synced multiple connections:', customerId);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: `Synced ${syncResults.filter(r => r.success).length} of ${syncResults.length} connections`,
          syncResults,
          updates
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single connection sync
    const hasValidUsername = customer.username?.trim().length > 0;
    const hasValidPassword = customer.password?.trim().length > 0;
    const hasValidMac = customer.mac_address?.trim().length > 0;

    let apiUrl: string;

    if (hasValidUsername && hasValidPassword) {
      apiUrl = `${panelUrl}?action=device_info&username=${customer.username}&password=${customer.password}&api_key=${apiKey}`;
    } else if (hasValidMac) {
      apiUrl = `${panelUrl}?action=device_info&mac=${customer.mac_address}&api_key=${apiKey}`;
    } else {
      return new Response(
        JSON.stringify({ error: 'No valid credentials for sync' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch(apiUrl);
    const data = await response.json();
    
    console.log('Single sync response:', { status: data.status, hasUserInfo: !!data.user_info, rawResponse: JSON.stringify(data).substring(0, 200) });

    // Check for various success status formats (providers return different formats)
    const isSuccess = response.ok && (data.status === 'true' || data.status === true || data.status === 'success' || data.user_info);
    if (!isSuccess) {
      console.error('Device info fetch failed:', { status: data.status, error: data.error || data.message || data.result });
      return new Response(
        JSON.stringify({ error: data.error || data.message || data.result || 'Failed to fetch device info' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updates: any = {};
    if (data.expire || data.user_info?.exp_date) {
      updates.expiration_date = data.user_info?.exp_date || data.expire;
    }
    const syncedM3uUrl = fixM3uUrl(data.user_info?.url || data.url, customer.username, customer.password, customer.provider);
    if (syncedM3uUrl) {
      updates.m3u_url = syncedM3uUrl;
    }

    if (Object.keys(updates).length > 0) {
      await supabaseClient
        .from('customers')
        .update(updates)
        .eq('id', customerId);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Device synced', updates }),
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