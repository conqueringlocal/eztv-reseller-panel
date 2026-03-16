import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface RenewSingleConnectionRequest {
  customerId: string;
  connectionNumber: number;
  planDuration: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { customerId, connectionNumber, planDuration }: RenewSingleConnectionRequest = await req.json();

    if (!customerId || !connectionNumber || !planDuration) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (![1, 3, 6, 12].includes(planDuration)) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan duration. Must be 1, 3, 6, or 12 months' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch customer details
    const { data: customer, error: customerError } = await supabase
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

    // Get user profile to check role
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, credits')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAdmin = userProfile.role === 'admin';

    // Authorization check
    if (!isAdmin && customer.reseller_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to renew this customer' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle Connection 1 (primary connection - stored in top-level fields)
    let connection: any;
    let connectionList: any[] = [];
    
    if (connectionNumber === 1) {
      // Connection 1 is the primary connection - use top-level fields
      connection = {
        connection_number: 1,
        username: customer.username,
        password: customer.password,
        mac_address: customer.mac_address,
        m3u_url: customer.m3u_url,
        expiration_date: customer.expiration_date,
        status: customer.status
      };
      
      // If connection_list exists, we'll need it for updating later
      if (customer.connection_list && Array.isArray(customer.connection_list)) {
        connectionList = customer.connection_list as any[];
      }
    } else {
      // Connection 2+ are in connection_list
      if (!customer.connection_list || !Array.isArray(customer.connection_list)) {
        return new Response(
          JSON.stringify({ error: 'Customer does not have multiple connections' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      connectionList = customer.connection_list as any[];
      connection = connectionList.find(c => c.connection_number === connectionNumber);
      
      if (!connection) {
        return new Response(
          JSON.stringify({ error: `Connection ${connectionNumber} not found` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Credit check (skip for admins)
    const creditsRequired = planDuration;
    if (!isAdmin) {
      if (userProfile.credits < creditsRequired) {
        return new Response(
          JSON.stringify({ 
            error: 'Insufficient credits',
            required: creditsRequired,
            available: userProfile.credits
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Call provider API based on provider type
    const provider = customer.provider || '8k';
    let renewalSuccess = false;
    let renewalError = null;

    if (provider === 'trex') {
      const apiKey = Deno.env.get('TREX_API_KEY');
      const panelUrl = Deno.env.get('TREX_PANEL_URL');
      
      if (!apiKey || !panelUrl) {
        throw new Error('Trex API credentials not configured');
      }

      // Determine if this is M3U or MAG
      const isMag = !!connection.mac_address;
      // Trex renewal API uses 0-indexed sub parameter
      const subParam = (planDuration - 1).toString();

      // Build URL in correct order: action → type → username/password → sub → api_key
      let renewUrl = `${panelUrl}?action=renew`;
      
      if (isMag) {
        renewUrl += `&type=mag&mac=${connection.mac_address}`;
      } else {
        renewUrl += `&type=m3u&username=${connection.username}&password=${connection.password}`;
      }
      
      renewUrl += `&sub=${subParam}&api_key=${apiKey}`;

      console.log(`🔄 Calling TREX API for Connection ${connectionNumber}:`, {
        username: connection.username,
        isMag,
        planDuration,
        expirationDate: connection.expiration_date
      });

      const response = await fetch(renewUrl);
      
      console.log(`📡 TREX Response Status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ TREX HTTP Error:', errorText);
        renewalError = `HTTP ${response.status}: ${errorText || 'Unknown error'}`;
        renewalSuccess = false;
      } else {
        const result = await response.json();
        console.log('📡 TREX Response Body:', JSON.stringify(result));
        
        // TREX API returns status: "true" (string) for success
        renewalSuccess = result.status === 'success' || result.status === 'true' || result.status === true;
        renewalError = renewalSuccess ? null : (
          result.message || 
          result.error || 
          result.msg || 
          result.reason || 
          'Unknown error from TREX API'
        );
        
        if (!renewalSuccess) {
          console.error('❌ TREX Renewal Failed:', renewalError);
        }
      }

    } else if (provider === '8k') {
      const apiKey = Deno.env.get('8K_API_KEY');
      const panelUrl = Deno.env.get('8K_PANEL_URL');
      
      if (!apiKey || !panelUrl) {
        throw new Error('8K API credentials not configured');
      }

      console.log(`🔄 Calling 8K API for Connection ${connectionNumber}`);

      const renewUrl = `${panelUrl}/api.php?apikey=${apiKey}&action=renew&username=${connection.username}&duration=${planDuration}`;
      const response = await fetch(renewUrl);
      
      console.log(`📡 8K Response Status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ 8K HTTP Error:', errorText);
        renewalError = `HTTP ${response.status}: ${errorText || 'Unknown error'}`;
        renewalSuccess = false;
      } else {
        const result = await response.json();
        console.log('📡 8K Response Body:', JSON.stringify(result));
        
        renewalSuccess = result.status === 'success';
        renewalError = renewalSuccess ? null : (
          result.message || result.error || result.msg || 'Unknown error from 8K API'
        );
        
        if (!renewalSuccess) {
          console.error('❌ 8K Renewal Failed:', renewalError);
        }
      }

    } else {
      // Default IPTV provider
      const apiKey = Deno.env.get('IPTV_API_KEY');
      const panelUrl = Deno.env.get('IPTV_PANEL_URL');
      
      if (!apiKey || !panelUrl) {
        throw new Error('IPTV API credentials not configured');
      }

      console.log(`🔄 Calling IPTV API for Connection ${connectionNumber}`);

      const renewUrl = `${panelUrl}/api.php?apikey=${apiKey}&action=renew&username=${connection.username}&duration=${planDuration}`;
      const response = await fetch(renewUrl);
      
      console.log(`📡 IPTV Response Status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ IPTV HTTP Error:', errorText);
        renewalError = `HTTP ${response.status}: ${errorText || 'Unknown error'}`;
        renewalSuccess = false;
      } else {
        const result = await response.json();
        console.log('📡 IPTV Response Body:', JSON.stringify(result));
        
        renewalSuccess = result.status === 'success';
        renewalError = renewalSuccess ? null : (
          result.message || result.error || result.msg || 'Unknown error from IPTV API'
        );
        
        if (!renewalSuccess) {
          console.error('❌ IPTV Renewal Failed:', renewalError);
        }
      }
    }

    if (!renewalSuccess) {
      console.error('Provider API renewal failed:', renewalError);
      return new Response(
        JSON.stringify({ error: `Failed to renew connection: ${renewalError}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate new expiration date for this connection
    const currentExpiration = new Date(connection.expiration_date || customer.expiration_date);
    const today = new Date();
    const baseDate = currentExpiration > today ? currentExpiration : today;
    const newExpiration = new Date(baseDate);
    newExpiration.setMonth(newExpiration.getMonth() + planDuration);
    const newExpirationStr = newExpiration.toISOString().split('T')[0];

    // Update database differently for Connection 1 vs secondary connections
    let updateData: any = { status: 'active' };
    
    if (connectionNumber === 1) {
      // Connection 1: Update top-level expiration_date
      updateData.expiration_date = newExpirationStr;
      
      // If there are secondary connections, find earliest expiration
      if (connectionList.length > 0) {
        const allExpirations = [newExpiration];
        connectionList.forEach(c => {
          if (c.expiration_date) {
            allExpirations.push(new Date(c.expiration_date));
          }
        });
        allExpirations.sort((a, b) => a.getTime() - b.getTime());
        updateData.expiration_date = allExpirations[0].toISOString().split('T')[0];
      }
    } else {
      // Connection 2+: Update the connection_list array
      const updatedConnectionList = connectionList.map(c => {
        if (c.connection_number === connectionNumber) {
          return { ...c, expiration_date: newExpirationStr };
        }
        return c;
      });
      
      // Find earliest expiration date across ALL connections (including Connection 1)
      const allExpirations = [new Date(customer.expiration_date)]; // Connection 1's date
      updatedConnectionList.forEach(c => {
        if (c.expiration_date) {
          allExpirations.push(new Date(c.expiration_date));
        }
      });
      allExpirations.sort((a, b) => a.getTime() - b.getTime());
      
      updateData.connection_list = updatedConnectionList;
      updateData.expiration_date = allExpirations[0].toISOString().split('T')[0];
    }

    // Update customer record
    const { error: updateError } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', customerId);

    if (updateError) {
      console.error('Failed to update customer:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update customer record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle credits and logging
    if (!isAdmin) {
      // Deduct credits from reseller
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: userProfile.credits - creditsRequired })
        .eq('id', user.id);

      if (creditError) {
        console.error('Failed to deduct credits:', creditError);
      }
    }

    // Log the renewal
    const { error: logError } = await supabase
      .from('credit_logs')
      .insert({
        reseller_id: customer.reseller_id,
        action: 'account_creation',
        credits_used: isAdmin ? 0 : creditsRequired,
        customer_id: customerId,
        customer_name: customer.name,
        connections_used: 1,
        notes: isAdmin 
          ? `ADMIN ACTION: Single connection renewal (Connection ${connectionNumber})`
          : `Single connection renewal (Connection ${connectionNumber})`
      });

    if (logError) {
      console.error('Failed to log credit usage:', logError);
    }

    console.log(`Successfully renewed connection ${connectionNumber} for customer ${customer.name}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Connection ${connectionNumber} renewed successfully`,
        newExpirationDate: newExpirationStr,
        creditsUsed: isAdmin ? 0 : creditsRequired
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
