import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
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

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sourceResellerId, targetResellerId, deleteSourceReseller = false } = await req.json();

    if (!sourceResellerId || !targetResellerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'sourceResellerId and targetResellerId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (sourceResellerId === targetResellerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Source and target reseller cannot be the same' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify both resellers exist
    const { data: sourceReseller } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', sourceResellerId)
      .single();

    const { data: targetReseller } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', targetResellerId)
      .single();

    if (!sourceReseller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Source reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!targetReseller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count customers before transfer
    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('reseller_id', sourceResellerId);

    if (!customerCount || customerCount === 0) {
      return new Response(
        JSON.stringify({ success: true, customersTransferred: 0, message: 'No customers to transfer' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transfer all customers to the target reseller
    const { error: transferError } = await supabase
      .from('customers')
      .update({ reseller_id: targetResellerId })
      .eq('reseller_id', sourceResellerId);

    if (transferError) {
      console.error('Error transferring customers:', transferError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to transfer customers: ${transferError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the transfer action
    await supabase
      .from('security_audit_logs')
      .insert({
        user_id: user.id,
        action: 'transfer_customers',
        resource_type: 'customers',
        resource_id: sourceResellerId,
        success: true,
        details: {
          source_reseller_name: sourceReseller.name,
          source_reseller_id: sourceResellerId,
          target_reseller_name: targetReseller.name,
          target_reseller_id: targetResellerId,
          customers_transferred: customerCount
        }
      });

    // Also add a note in credit_logs for audit trail
    await supabase
      .from('credit_logs')
      .insert({
        reseller_id: targetResellerId,
        action: 'addition',
        credits_used: 0,
        notes: `Received ${customerCount} customer(s) transferred from ${sourceReseller.name}`
      });

    let resellerDeleted = false;

    // Optionally delete the source reseller after transfer
    if (deleteSourceReseller) {
      // Delete related data
      await supabase.from('credit_logs').delete().eq('reseller_id', sourceResellerId);
      await supabase.from('reseller_api_keys').delete().eq('reseller_id', sourceResellerId);
      await supabase.from('reseller_highlevel_settings').delete().eq('reseller_id', sourceResellerId);
      await supabase.from('sso_tokens').delete().eq('reseller_id', sourceResellerId);
      await supabase.from('sso_audit_logs').delete().eq('reseller_id', sourceResellerId);
      await supabase.from('funnels').delete().eq('reseller_id', sourceResellerId);
      
      // Delete the profile
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', sourceResellerId);

      if (!deleteProfileError) {
        // Delete auth user
        await supabase.auth.admin.deleteUser(sourceResellerId);
        resellerDeleted = true;

        // Log the reseller deletion
        await supabase
          .from('security_audit_logs')
          .insert({
            user_id: user.id,
            action: 'delete_reseller',
            resource_type: 'reseller',
            resource_id: sourceResellerId,
            success: true,
            details: {
              reseller_name: sourceReseller.name,
              reseller_email: sourceReseller.email,
              reason: 'Deleted after customer transfer'
            }
          });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        customersTransferred: customerCount,
        resellerDeleted,
        message: `Transferred ${customerCount} customer(s) from ${sourceReseller.name} to ${targetReseller.name}${resellerDeleted ? ' and deleted source reseller' : ''}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transfer-customers:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
