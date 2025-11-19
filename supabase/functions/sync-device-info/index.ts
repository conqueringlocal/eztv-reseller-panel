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

    // Function to sync a single connection
    async function syncSingleConnection(
      credentials: { username?: string; password?: string; mac_address?: string },
      connectionNum: number
    ) {
      const hasValidUsername = credentials.username?.trim().length > 0;
      const hasValidPassword = credentials.password?.trim().length > 0;
      const hasValidMac = credentials.mac_address?.trim().length > 0;
      
      console.log(`Syncing connection ${connectionNum}:`, {
        hasValidUsername,
        hasValidPassword,
        hasValidMac
      });

      let apiUrl: string;
      
      if (hasValidUsername && hasValidPassword) {
        apiUrl = `${panelUrl}?action=device_info&username=${credentials.username}&password=${credentials.password}&api_key=${apiKey}`;
      } else if (hasValidMac) {
        apiUrl = `${panelUrl}?action=device_info&mac=${credentials.mac_address}&api_key=${apiKey}`;
      } else {
        return { 
          success: false, 
          error: 'No valid credentials',
          connectionNumber: connectionNum 
        };
      }
      
      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!response.ok || data.status !== 'true') {
          return {
            success: false,
            error: 'API error',
            connectionNumber: connectionNum
          };
        }
        
        return {
          success: true,
          expire: data.user_info?.exp_date || data.expire,
          m3uUrl: data.user_info?.url || data.url,
          connectionNumber: connectionNum
        };
      } catch (error) {
        console.error(`Error syncing connection ${connectionNum}:`, error);
        return {
          success: false,
          error: error.message,
          connectionNumber: connectionNum
        };
      }
    }

    // If multiple connections exist, sync all of them
    if (hasMultipleConnections) {
      console.log('Syncing multiple connections...');
      
      const syncResults = [];
      const updatedConnectionList = [];
      
      // Sync primary connection first
      const primaryResult = await syncSingleConnection(
        { 
          username: customer.username, 
          password: customer.password, 
          mac_address: customer.mac_address 
        },
        1
      );
      
      syncResults.push(primaryResult);
      
      // Sync each connection in connection_list
      for (let i = 0; i < connectionList.length; i++) {
        const conn = connectionList[i];
        const result = await syncSingleConnection(
          {
            username: conn.username,
            password: conn.password,
            mac_address: conn.macAddress || conn.mac_address
          },
          conn.connection_number || conn.connectionNumber || (i + 2)
        );
        
        // Update connection with new expiration date and M3U URL
        updatedConnectionList.push({
          ...conn,
          expirationDate: result.expire || conn.expirationDate,
          m3uUrl: result.m3uUrl || conn.m3uUrl
        });
        
        syncResults.push(result);
      }
      
      // Find earliest expiration date among successful syncs
      const allExpirations = syncResults
        .filter(r => r.success && r.expire)
        .map(r => new Date(r.expire));
      
      let earliestExpiration;
      if (allExpirations.length > 0) {
        earliestExpiration = new Date(Math.min(...allExpirations.map(d => d.getTime())));
      }
      
      // Update database with all synced connections
      const updates: any = {
        connection_list: updatedConnectionList
      };
      
      if (earliestExpiration) {
        updates.expiration_date = earliestExpiration.toISOString().split('T')[0];
      }
      
      // If primary connection was synced successfully, update top-level M3U URL
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
      
      console.log('Successfully synced multiple connections:', customerId, syncResults);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: `Synced ${syncResults.filter(r => r.success).length} of ${syncResults.length} connections successfully`,
          syncResults,
          earliestExpiration: earliestExpiration?.toISOString().split('T')[0],
          updates
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single connection sync (fallback for non-consolidated customers)
    console.log('Syncing single connection...');
    
    // Clean and validate credentials
    const hasValidUsername = customer.username && customer.username.trim().length > 0;
    const hasValidPassword = customer.password && customer.password.trim().length > 0;
    const hasValidMac = customer.mac_address && customer.mac_address.trim().length > 0;

    console.log('Credential validation:', {
      hasValidUsername,
      hasValidPassword,
      hasValidMac,
      usernameValue: customer.username,
      passwordExists: !!customer.password
    });

    let apiUrl: string;
    let deviceCategory: string;

    if (hasValidUsername && hasValidPassword) {
      deviceCategory = 'M3U-based';
      apiUrl = `${panelUrl}?action=device_info&username=${customer.username}&password=${customer.password}&api_key=${apiKey}`;
      console.log('Using M3U-based sync for device type:', customer.device_type);
    } else if (hasValidMac) {
      deviceCategory = 'MAC-based';
      apiUrl = `${panelUrl}?action=device_info&mac=${customer.mac_address}&api_key=${apiKey}`;
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

    if (!response.ok || data.status !== 'true') {
      console.error('API error:', data);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch device info from panel' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { expire, url } = data;

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
        JSON.stringify({ message: 'No updates needed', data: data }),
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
        panelData: data 
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