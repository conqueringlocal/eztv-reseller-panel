import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MergeRequest {
  sourceCustomerId: string;
  targetCustomerId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile to check role and reseller_id
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAdmin = userProfile.role === 'admin';

    // Parse request body
    const { sourceCustomerId, targetCustomerId }: MergeRequest = await req.json();

    if (!sourceCustomerId || !targetCustomerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Both sourceCustomerId and targetCustomerId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (sourceCustomerId === targetCustomerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot merge a customer into itself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch source customer
    const { data: sourceCustomer, error: sourceError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', sourceCustomerId)
      .single();

    if (sourceError || !sourceCustomer) {
      return new Response(
        JSON.stringify({ success: false, error: 'Source customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch target customer
    const { data: targetCustomer, error: targetError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', targetCustomerId)
      .single();

    if (targetError || !targetCustomer) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization check: user must own both customers or be admin
    if (!isAdmin) {
      if (sourceCustomer.reseller_id !== user.id || targetCustomer.reseller_id !== user.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'You can only merge your own customers' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Ensure both customers belong to the same reseller
    if (sourceCustomer.reseller_id !== targetCustomer.reseller_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot merge customers from different resellers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the source connection to add to target
    const sourceConnection = {
      connection_number: 0, // Will be set based on target's existing connections
      username: sourceCustomer.username,
      password: sourceCustomer.password,
      m3u_url: sourceCustomer.m3u_url,
      expiration_date: sourceCustomer.expiration_date,
      status: sourceCustomer.status || 'active',
    };

    // Get target's current connection list or create one from primary credentials
    let targetConnectionList: any[] = [];
    
    if (targetCustomer.connection_list && Array.isArray(targetCustomer.connection_list)) {
      targetConnectionList = [...targetCustomer.connection_list];
    } else {
      // Create initial connection from target's primary credentials
      targetConnectionList = [
        {
          connection_number: 1,
          username: targetCustomer.username,
          password: targetCustomer.password,
          m3u_url: targetCustomer.m3u_url,
          expiration_date: targetCustomer.expiration_date,
          status: targetCustomer.status || 'active',
        },
      ];
    }

    // Determine the next connection number
    const maxConnectionNumber = Math.max(...targetConnectionList.map((c) => c.connection_number || 0), 0);
    sourceConnection.connection_number = maxConnectionNumber + 1;

    // Add the source connection to the target's list
    targetConnectionList.push(sourceConnection);

    // Update the target customer
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        connection_list: targetConnectionList,
        total_connections: targetConnectionList.length,
        max_connections: targetConnectionList.length,
      })
      .eq('id', targetCustomerId);

    if (updateError) {
      console.error('Error updating target customer:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update target customer' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete the source customer
    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', sourceCustomerId);

    if (deleteError) {
      console.error('Error deleting source customer:', deleteError);
      // Don't fail the whole operation, but log the issue
    }

    // Log the merge in security audit
    await supabase
      .from('security_audit_logs')
      .insert({
        user_id: user.id,
        action: 'merge_customers',
        resource_type: 'customer',
        resource_id: targetCustomerId,
        success: true,
        details: {
          source_customer_id: sourceCustomerId,
          source_customer_name: sourceCustomer.name,
          target_customer_id: targetCustomerId,
          target_customer_name: targetCustomer.name,
          new_connection_number: sourceConnection.connection_number,
          total_connections: targetConnectionList.length,
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully merged ${sourceCustomer.name} into ${targetCustomer.name}`,
        newConnectionNumber: sourceConnection.connection_number,
        totalConnections: targetConnectionList.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Unexpected error in merge-customer-into-group:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
