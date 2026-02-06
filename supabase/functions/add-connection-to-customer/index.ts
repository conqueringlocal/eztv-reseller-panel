import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import { corsHeaders } from '../_shared/cors.ts';

// M3U streaming domain for Trex provider
const TREX_M3U_DOMAIN = 'vpn.eztvclub.online';

const TREX_PANEL_URL = Deno.env.get('TREX_PANEL_URL') || 'https://activationpanel.net/api/api.php';
const IPTV_PANEL_URL = Deno.env.get('IPTV_PANEL_URL') || Deno.env.get('8K_PANEL_URL') || 'https://my8k.me/api/api.php';
const TREX_API_KEY = Deno.env.get('TREX_API_KEY') || '';
const IPTV_API_KEY = Deno.env.get('IPTV_API_KEY') || Deno.env.get('8K_API_KEY') || '';

Deno.serve(async (req) => {
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

    // Get user from JWT
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { customer_id, plan_duration } = await req.json();

    if (!customer_id || !plan_duration) {
      throw new Error('Missing required parameters: customer_id and plan_duration');
    }

    console.log(`🔄 Adding connection to customer ${customer_id} for ${plan_duration} months`);

    // Fetch customer record
    const { data: customer, error: customerError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .single();

    if (customerError || !customer) {
      throw new Error('Customer not found');
    }

    // Fetch user's profile to check role
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role, credits, provider, api_key, panel_url, use_admin_api')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    const isAdmin = profile.role === 'admin';

    // Check authorization - user must own the customer or be admin
    if (!isAdmin && customer.reseller_id !== user.id) {
      throw new Error('Unauthorized to modify this customer');
    }

    // Determine the next connection number and handle migration if needed
    let connectionNumber = 1;
    let needsMigration = false;
    
    if (customer.connection_list && Array.isArray(customer.connection_list) && customer.connection_list.length > 0) {
      // Customer already has connections in the list
      connectionNumber = customer.connection_list.length + 1;
    } else if (customer.username && customer.password) {
      // Customer has primary credentials but empty/null connection_list - need to migrate
      needsMigration = true;
      connectionNumber = 2; // The new connection will be #2 after we migrate the primary
    } else if (customer.connection_sequence) {
      // Legacy format - count existing connections in the customer_group
      const { count } = await supabaseClient
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('customer_group', customer.customer_group)
        .neq('status', 'cancelled');
      connectionNumber = (count || 0) + 1;
    }

    console.log(`📝 Creating connection #${connectionNumber}${needsMigration ? ' (will migrate primary first)' : ''}`);

    // Get API credentials (only needed if we're creating a new connection via API)
    let newCredentials: any;
    
    if (needsMigration) {
      // For migration, we DON'T call the provider API for connection 1
      // We only create the NEW connection (connection 2)
      console.log(`🔄 Migration mode: will use existing credentials for connection 1, creating NEW connection 2`);
      
      const provider = customer.provider || 'trex';
      let apiKey: string;
      let panelUrl: string;

      if (isAdmin || profile.use_admin_api) {
        apiKey = provider === 'trex' ? TREX_API_KEY : IPTV_API_KEY;
        panelUrl = provider === 'trex' ? TREX_PANEL_URL : IPTV_PANEL_URL;
      } else {
        if (!profile.api_key || !profile.panel_url) {
          throw new Error('Reseller API credentials not configured');
        }
        apiKey = profile.api_key;
        panelUrl = profile.panel_url;
      }

      console.log(`🔗 Calling ${provider.toUpperCase()} API for new connection`);

      // Call provider API to create the NEW connection
      const accountType = customer.device_type === 'mag' ? 'mag' : 'm3u';
      
      if (provider === 'trex') {
        console.log(`🔗 Calling TREX API for ${accountType} account`);
        
        const baseUrl = panelUrl.replace('/api/api.php', '');
        const apiUrl = new URL(`${baseUrl}/api/api.php`);
        
        apiUrl.searchParams.append('action', 'new');
        apiUrl.searchParams.append('type', accountType);
        apiUrl.searchParams.append('sub', plan_duration.toString());
        apiUrl.searchParams.append('pack', customer.package_id || '');
        apiUrl.searchParams.append('api_key', apiKey);
        apiUrl.searchParams.append('note', `Add connection for ${customer.name}`);
        
        console.log(`🔗 TREX API URL: ${apiUrl.toString().replace(apiKey, '[REDACTED]')}`);
        
        const response = await fetch(apiUrl.toString());
        const responseText = await response.text();

        console.log(`📡 TREX API Response Status: ${response.status}`);
        console.log(`📡 TREX API Response: ${responseText}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Try to parse as JSON first
        let apiResult;
        try {
          apiResult = JSON.parse(responseText);
        } catch (parseError) {
          console.log(`📄 Parsing text response`);
          apiResult = {
            success: true,
            response: responseText
          };
        }

        // Extract credentials from TREX response
        const finalUsername = apiResult.username || apiResult.user;
        const finalPassword = apiResult.password || apiResult.pass;
        const expirationDate = apiResult.expiration || apiResult.exp_date;
        const m3uUrl = apiResult.m3u_url || apiResult.url;

        // Validate we got credentials back
        if (!finalUsername || !finalPassword) {
          throw new Error(`TREX API did not return credentials: ${responseText}`);
        }

        newCredentials = {
          connection_number: connectionNumber,
          username: accountType === 'mag' ? null : finalUsername,
          password: accountType === 'mag' ? null : finalPassword,
          mac_address: accountType === 'mag' ? finalUsername : null,
          m3u_url: accountType === 'mag' ? null : `http://${TREX_M3U_DOMAIN}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`,
          expiration_date: expirationDate || new Date(Date.now() + plan_duration * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'active',
        };
      } else {
        // 8K/IPTV API call
        console.log(`🔗 Calling 8K/IPTV API for ${accountType} account`);
        
        const baseUsername = customer.username || customer.name.toLowerCase().replace(/\s+/g, '');
        const newUsername = `${baseUsername}_${connectionNumber}`;
        const newPassword = Math.random().toString(36).slice(-8);
        
        let apiUrl: string;
        if (accountType === 'mag') {
          apiUrl = `${panelUrl}?action=create&type=mag&mac=${newUsername}&sub=month_${plan_duration}&bouquet=${customer.package_id || ''}&api_key=${apiKey}`;
        } else {
          apiUrl = `${panelUrl}?action=create&type=m3u&username=${newUsername}&password=${newPassword}&sub=month_${plan_duration}&bouquet=${customer.package_id || ''}&api_key=${apiKey}`;
        }

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!response.ok || !data) {
          throw new Error(`Provider API error: ${JSON.stringify(data)}`);
        }

        const expirationDate = data.expiration || data.exp_date || new Date(Date.now() + plan_duration * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const m3uUrl = accountType === 'mag' ? null : (data.m3u_url || `${panelUrl.replace('/api/api.php', '')}/get.php?username=${newUsername}&password=${newPassword}&type=m3u_plus&output=ts`);

        newCredentials = {
          connection_number: connectionNumber,
          username: accountType === 'mag' ? null : newUsername,
          password: accountType === 'mag' ? null : newPassword,
          mac_address: accountType === 'mag' ? newUsername : null,
          m3u_url: m3uUrl,
          expiration_date: expirationDate,
          status: 'active',
        };
      }

      console.log(`✅ New connection created via provider API`);
    } else {
      // Normal flow - create a new connection
      const provider = customer.provider || 'trex';
      let apiKey: string;
      let panelUrl: string;

      if (isAdmin || profile.use_admin_api) {
        apiKey = provider === 'trex' ? TREX_API_KEY : IPTV_API_KEY;
        panelUrl = provider === 'trex' ? TREX_PANEL_URL : IPTV_PANEL_URL;
      } else {
        if (!profile.api_key || !profile.panel_url) {
          throw new Error('Reseller API credentials not configured');
        }
        apiKey = profile.api_key;
        panelUrl = profile.panel_url;
      }

      console.log(`🔗 Calling ${provider.toUpperCase()} API for ${customer.device_type} account`);

      // Call provider API
      const accountType = customer.device_type === 'mag' ? 'mag' : 'm3u';

      if (provider === 'trex') {
        console.log(`🔗 Calling TREX API for ${accountType} account`);
        
        const baseUrl = panelUrl.replace('/api/api.php', '');
        const apiUrl = new URL(`${baseUrl}/api/api.php`);
        
        apiUrl.searchParams.append('action', 'new');
        apiUrl.searchParams.append('type', accountType);
        apiUrl.searchParams.append('sub', plan_duration.toString());
        apiUrl.searchParams.append('pack', customer.package_id || '');
        apiUrl.searchParams.append('api_key', apiKey);
        apiUrl.searchParams.append('note', `Add connection for ${customer.name}`);
        
        console.log(`🔗 TREX API URL: ${apiUrl.toString().replace(apiKey, '[REDACTED]')}`);
        
        const response = await fetch(apiUrl.toString());
        const responseText = await response.text();

        console.log(`📡 TREX API Response Status: ${response.status}`);
        console.log(`📡 TREX API Response: ${responseText}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Try to parse as JSON first
        let apiResult;
        try {
          apiResult = JSON.parse(responseText);
        } catch (parseError) {
          console.log(`📄 Parsing text response`);
          apiResult = {
            success: true,
            response: responseText
          };
        }

        // Extract credentials from TREX response
        const finalUsername = apiResult.username || apiResult.user;
        const finalPassword = apiResult.password || apiResult.pass;
        const expirationDate = apiResult.expiration || apiResult.exp_date;
        const m3uUrl = apiResult.m3u_url || apiResult.url;

        // Validate we got credentials back
        if (!finalUsername || !finalPassword) {
          throw new Error(`TREX API did not return credentials: ${responseText}`);
        }

        newCredentials = {
          connection_number: connectionNumber,
          username: accountType === 'mag' ? null : finalUsername,
          password: accountType === 'mag' ? null : finalPassword,
          mac_address: accountType === 'mag' ? finalUsername : null,
          m3u_url: accountType === 'mag' ? null : `http://${TREX_M3U_DOMAIN}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`,
          expiration_date: expirationDate || new Date(Date.now() + plan_duration * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'active',
        };
      } else {
        // 8K/IPTV API call
        console.log(`🔗 Calling 8K/IPTV API for ${accountType} account`);
        
        const baseUsername = customer.username || customer.name.toLowerCase().replace(/\s+/g, '');
        const newUsername = `${baseUsername}_${connectionNumber}`;
        const newPassword = Math.random().toString(36).slice(-8);
        
        let apiUrl: string;
        if (accountType === 'mag') {
          apiUrl = `${panelUrl}?action=create&type=mag&mac=${newUsername}&sub=month_${plan_duration}&bouquet=${customer.package_id || ''}&api_key=${apiKey}`;
        } else {
          apiUrl = `${panelUrl}?action=create&type=m3u&username=${newUsername}&password=${newPassword}&sub=month_${plan_duration}&bouquet=${customer.package_id || ''}&api_key=${apiKey}`;
        }

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!response.ok || !data) {
          throw new Error(`Provider API error: ${JSON.stringify(data)}`);
        }

        const expirationDate = data.expiration || data.exp_date || new Date(Date.now() + plan_duration * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const m3uUrl = accountType === 'mag' ? null : (data.m3u_url || `${panelUrl.replace('/api/api.php', '')}/get.php?username=${newUsername}&password=${newPassword}&type=m3u_plus&output=ts`);

        newCredentials = {
          connection_number: connectionNumber,
          username: accountType === 'mag' ? null : newUsername,
          password: accountType === 'mag' ? null : newPassword,
          mac_address: accountType === 'mag' ? newUsername : null,
          m3u_url: m3uUrl,
          expiration_date: expirationDate,
          status: 'active',
        };
      }

      console.log(`✅ New connection created via provider API`);
    }

    // Update database
    if (customer.connection_list !== undefined && customer.connection_list !== null) {
      // Consolidated customer - append to connection_list
      let updatedConnectionList = [...(customer.connection_list || [])];
      
      // If we need to migrate the primary connection first
      if (needsMigration) {
        const primaryConnection = {
          connection_number: 1,
          username: customer.username,
          password: customer.password,
          mac_address: customer.mac_address || null,
          m3u_url: customer.m3u_url || null,
          expiration_date: customer.expiration_date,
          status: customer.status,
        };
        updatedConnectionList.push(primaryConnection);
        console.log(`🔄 Migrated primary connection to connection_list`);
      }
      
      // Add the new connection
      updatedConnectionList.push(newCredentials);
      const newTotalConnections = updatedConnectionList.length;

      const { error: updateError } = await supabaseClient
        .from('customers')
        .update({
          connection_list: updatedConnectionList,
          total_connections: newTotalConnections,
        })
        .eq('id', customer.id);

      if (updateError) throw updateError;

      console.log(`✅ Updated consolidated customer record with ${newTotalConnections} connections`);
    } else {
      // Legacy customer - insert new row
      const newCustomer = {
        reseller_id: customer.reseller_id,
        name: customer.name,
        email: customer.email,
        customer_group: customer.customer_group,
        connection_sequence: connectionNumber,
        username: newUsername,
        password: newPassword,
        mac_address: newCredentials.mac_address || null,
        m3u_url: newCredentials.m3u_url || null,
        device_type: customer.device_type,
        package_id: customer.package_id,
        provider: customer.provider,
        plan_duration,
        start_date: new Date().toISOString().split('T')[0],
        expiration_date: newCredentials.expiration_date,
        status: 'active',
      };

      const { error: insertError } = await supabaseClient
        .from('customers')
        .insert(newCustomer);

      if (insertError) throw insertError;

      console.log(`✅ Inserted new customer record (legacy format)`);
    }

    // Handle credits
    const creditsRequired = isAdmin ? 0 : plan_duration;

    if (!isAdmin) {
      // Deduct credits from reseller
      const { error: creditError } = await supabaseClient
        .from('profiles')
        .update({ credits: profile.credits - creditsRequired })
        .eq('id', user.id);

      if (creditError) throw creditError;

      console.log(`💳 Deducted ${creditsRequired} credits from reseller`);
    }

    // Log to credit_logs
    const { error: logError } = await supabaseClient
      .from('credit_logs')
      .insert({
        reseller_id: customer.reseller_id,
        action: 'account_creation',
        credits_used: creditsRequired,
        customer_id: customer.id,
        customer_name: customer.name,
        connections_used: 1,
        notes: isAdmin
          ? `ADMIN ACTION: Added connection ${connectionNumber} to customer`
          : `Added connection ${connectionNumber} to customer`,
      });

    if (logError) {
      console.error('Failed to log to credit_logs:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        connection_number: connectionNumber,
        credentials: newCredentials,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Error adding connection:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
