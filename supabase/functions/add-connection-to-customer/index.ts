import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import { corsHeaders } from '../_shared/cors.ts';

const TREX_PANEL_URL = Deno.env.get('TREX_PANEL_URL') || 'https://activationpanel.net/api/api.php';
const IPTV_PANEL_URL = Deno.env.get('IPTV_PANEL_URL') || Deno.env.get('8K_PANEL_URL') || 'https://my8k.me/api/api.php';

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

    // Determine the next connection number
    let connectionNumber = 1;
    if (customer.connection_list && Array.isArray(customer.connection_list)) {
      connectionNumber = customer.connection_list.length + 1;
    } else if (customer.connection_sequence) {
      // Count existing connections in the customer_group
      const { count } = await supabaseClient
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('customer_group', customer.customer_group)
        .neq('status', 'cancelled');
      connectionNumber = (count || 0) + 1;
    }

    console.log(`📝 Creating connection #${connectionNumber}`);

    // Get API credentials
    const provider = customer.provider || 'trex';
    let apiKey: string;
    let panelUrl: string;

    if (profile.use_admin_api) {
      // Use admin API credentials
      if (provider === 'trex') {
        apiKey = Deno.env.get('TREX_API_KEY') || '';
        panelUrl = TREX_PANEL_URL;
      } else {
        apiKey = Deno.env.get('8K_API_KEY') || '';
        panelUrl = IPTV_PANEL_URL;
      }
    } else {
      // Use reseller's own API credentials
      apiKey = profile.api_key || '';
      panelUrl = profile.panel_url || (provider === 'trex' ? TREX_PANEL_URL : IPTV_PANEL_URL);
    }

    if (!apiKey) {
      throw new Error(`API key not configured for provider ${provider}`);
    }

    // Generate credentials for the new connection
    const baseUsername = customer.username || customer.name.toLowerCase().replace(/\s+/g, '');
    const newUsername = `${baseUsername}_${connectionNumber}`;
    const newPassword = Math.random().toString(36).slice(-8);

    // Call provider API to create the account
    let apiResponse;
    let newCredentials: any = {
      connection_number: connectionNumber,
      username: newUsername,
      password: newPassword,
    };

    if (provider === 'trex') {
      const isMag = customer.device_type === 'MAG';
      const accountType = isMag ? 'mag' : 'm3u';
      const credentialParam = isMag
        ? `mac=${customer.mac_address || ''}`
        : `username=${newUsername}&password=${newPassword}`;

      const apiUrl = `${panelUrl}?action=create&type=${accountType}&package=${customer.package_id}&sub=${plan_duration}&${credentialParam}&api_key=${apiKey}`;

      console.log(`🔗 Calling TREX API for ${accountType} account`);
      
      const response = await fetch(apiUrl);
      apiResponse = await response.json();

      if (isMag) {
        newCredentials.mac_address = customer.mac_address;
      }

      // Extract M3U URL if present
      if (apiResponse.m3u_url) {
        newCredentials.m3u_url = apiResponse.m3u_url;
      }
    } else {
      // 8K/IPTV provider
      const apiUrl = `${panelUrl}?action=create&username=${newUsername}&password=${newPassword}&package=${customer.package_id}&sub=${plan_duration}&api_key=${apiKey}`;

      console.log(`🔗 Calling 8K/IPTV API`);
      
      const response = await fetch(apiUrl);
      apiResponse = await response.json();

      if (apiResponse.m3u_url) {
        newCredentials.m3u_url = apiResponse.m3u_url;
      }
    }

    // Extract expiration date from API response
    const expirationDate = apiResponse.expiration_date || 
                          new Date(Date.now() + plan_duration * 30 * 24 * 60 * 60 * 1000).toISOString();

    newCredentials.expiration_date = expirationDate;
    newCredentials.status = 'active';

    console.log(`✅ New connection created via provider API`);

    // Update database
    if (customer.connection_list && Array.isArray(customer.connection_list)) {
      // Consolidated customer - append to connection_list
      const updatedConnectionList = [...customer.connection_list, newCredentials];
      const newTotalConnections = (customer.total_connections || 0) + 1;

      const { error: updateError } = await supabaseClient
        .from('customers')
        .update({
          connection_list: updatedConnectionList,
          total_connections: newTotalConnections,
        })
        .eq('id', customer.id);

      if (updateError) throw updateError;

      console.log(`✅ Updated consolidated customer record`);
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
        expiration_date: expirationDate.split('T')[0],
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
