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

    const { resellerId, deleteReseller = false } = await req.json();

    if (!resellerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'resellerId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the reseller exists
    const { data: reseller } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', resellerId)
      .single();

    if (!reseller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count customers before deletion
    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('reseller_id', resellerId);

    // Delete all customers for this reseller
    const { error: deleteCustomersError } = await supabase
      .from('customers')
      .delete()
      .eq('reseller_id', resellerId);

    if (deleteCustomersError) {
      console.error('Error deleting customers:', deleteCustomersError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to delete customers: ${deleteCustomersError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the cleanup action
    await supabase
      .from('security_audit_logs')
      .insert({
        user_id: user.id,
        action: 'bulk_delete_customers',
        resource_type: 'customers',
        resource_id: resellerId,
        success: true,
        details: {
          reseller_name: reseller.name,
          customers_deleted: customerCount || 0,
          delete_reseller: deleteReseller
        }
      });

    let resellerDeleted = false;

    // Optionally delete the reseller too
    if (deleteReseller) {
      // Delete related data first
      await supabase.from('credit_logs').delete().eq('reseller_id', resellerId);
      await supabase.from('reseller_api_keys').delete().eq('reseller_id', resellerId);
      await supabase.from('reseller_highlevel_settings').delete().eq('reseller_id', resellerId);
      await supabase.from('sso_tokens').delete().eq('reseller_id', resellerId);
      await supabase.from('sso_audit_logs').delete().eq('reseller_id', resellerId);
      await supabase.from('funnels').delete().eq('reseller_id', resellerId);
      
      // Delete the profile
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', resellerId);

      if (deleteProfileError) {
        console.error('Error deleting profile:', deleteProfileError);
        return new Response(
          JSON.stringify({ 
            success: true, 
            customersDeleted: customerCount || 0,
            resellerDeleted: false,
            warning: 'Customers deleted but failed to delete reseller profile'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete auth user
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(resellerId);
      if (authDeleteError) {
        console.warn('Could not delete auth user:', authDeleteError);
      }

      resellerDeleted = true;

      // Log the reseller deletion
      await supabase
        .from('security_audit_logs')
        .insert({
          user_id: user.id,
          action: 'delete_reseller',
          resource_type: 'reseller',
          resource_id: resellerId,
          success: true,
          details: {
            reseller_name: reseller.name,
            reseller_email: reseller.email
          }
        });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        customersDeleted: customerCount || 0,
        resellerDeleted,
        message: deleteReseller 
          ? `Deleted ${customerCount || 0} customers and reseller ${reseller.name}`
          : `Deleted ${customerCount || 0} customers for ${reseller.name}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in admin-cleanup-customers:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
