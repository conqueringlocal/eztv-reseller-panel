
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the requesting user is an admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only admins can delete resellers' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get reseller ID from request body
    const { resellerId } = await req.json();
    if (!resellerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Reseller ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🗑️ Admin ${user.email} attempting to delete reseller ${resellerId}`);

    // Verify reseller exists and is actually a reseller
    const { data: reseller, error: resellerError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', resellerId)
      .single();

    if (resellerError || !reseller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (reseller.role !== 'reseller') {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot delete non-reseller accounts' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Safety check: Check for customers
    const { count: customerCount, error: customerCountError } = await supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('reseller_id', resellerId);

    if (customerCountError) {
      console.error('Error checking customers:', customerCountError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check reseller customers' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (customerCount && customerCount > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot delete reseller with existing customers. This reseller has ${customerCount} customer(s). Please remove or reassign customers first.` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Safety check: Check for sub-resellers
    const { count: subResellerCount, error: subResellerCountError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('parent_reseller_id', resellerId);

    if (subResellerCountError) {
      console.error('Error checking sub-resellers:', subResellerCountError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check sub-resellers' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (subResellerCount && subResellerCount > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot delete reseller with sub-resellers. This reseller has ${subResellerCount} sub-reseller(s). Please delete sub-resellers first.` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Safety checks passed for reseller ${reseller.email}`);

    // Delete related data in order
    // 1. Delete credit_logs
    const { error: creditLogsError } = await supabaseAdmin
      .from('credit_logs')
      .delete()
      .eq('reseller_id', resellerId);
    
    if (creditLogsError) {
      console.error('Error deleting credit_logs:', creditLogsError);
    } else {
      console.log('✅ Deleted credit_logs');
    }

    // 2. Delete reseller_api_keys
    const { error: apiKeysError } = await supabaseAdmin
      .from('reseller_api_keys')
      .delete()
      .eq('reseller_id', resellerId);
    
    if (apiKeysError) {
      console.error('Error deleting reseller_api_keys:', apiKeysError);
    } else {
      console.log('✅ Deleted reseller_api_keys');
    }

    // 3. Delete reseller_highlevel_settings
    const { error: hlSettingsError } = await supabaseAdmin
      .from('reseller_highlevel_settings')
      .delete()
      .eq('reseller_id', resellerId);
    
    if (hlSettingsError) {
      console.error('Error deleting reseller_highlevel_settings:', hlSettingsError);
    } else {
      console.log('✅ Deleted reseller_highlevel_settings');
    }

    // 4. Delete sso_tokens
    const { error: ssoTokensError } = await supabaseAdmin
      .from('sso_tokens')
      .delete()
      .eq('reseller_id', resellerId);
    
    if (ssoTokensError) {
      console.error('Error deleting sso_tokens:', ssoTokensError);
    } else {
      console.log('✅ Deleted sso_tokens');
    }

    // 5. Delete sso_audit_logs
    const { error: ssoAuditError } = await supabaseAdmin
      .from('sso_audit_logs')
      .delete()
      .eq('reseller_id', resellerId);
    
    if (ssoAuditError) {
      console.error('Error deleting sso_audit_logs:', ssoAuditError);
    } else {
      console.log('✅ Deleted sso_audit_logs');
    }

    // 6. Get funnels for this reseller to delete their leads
    const { data: funnels } = await supabaseAdmin
      .from('funnels')
      .select('id')
      .eq('reseller_id', resellerId);

    if (funnels && funnels.length > 0) {
      const funnelIds = funnels.map(f => f.id);
      
      // Delete funnel_leads for these funnels
      const { error: funnelLeadsError } = await supabaseAdmin
        .from('funnel_leads')
        .delete()
        .in('funnel_id', funnelIds);
      
      if (funnelLeadsError) {
        console.error('Error deleting funnel_leads:', funnelLeadsError);
      } else {
        console.log('✅ Deleted funnel_leads');
      }
    }

    // 7. Delete funnels
    const { error: funnelsError } = await supabaseAdmin
      .from('funnels')
      .delete()
      .eq('reseller_id', resellerId);
    
    if (funnelsError) {
      console.error('Error deleting funnels:', funnelsError);
    } else {
      console.log('✅ Deleted funnels');
    }

    // 8. Delete credit_requests (both as requester and parent)
    const { error: creditRequestsError1 } = await supabaseAdmin
      .from('credit_requests')
      .delete()
      .eq('requester_id', resellerId);
    
    const { error: creditRequestsError2 } = await supabaseAdmin
      .from('credit_requests')
      .delete()
      .eq('parent_reseller_id', resellerId);
    
    if (creditRequestsError1 || creditRequestsError2) {
      console.error('Error deleting credit_requests:', creditRequestsError1 || creditRequestsError2);
    } else {
      console.log('✅ Deleted credit_requests');
    }

    // 9. Delete profile
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', resellerId);
    
    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to delete reseller profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('✅ Deleted profile');

    // 10. Delete auth user
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(resellerId);
    
    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      // Profile is already deleted, so we should report this but still consider it a success
      console.warn('⚠️ Auth user deletion failed but profile was deleted');
    } else {
      console.log('✅ Deleted auth user');
    }

    // 11. Log the deletion to security audit logs
    const { error: auditError } = await supabaseAdmin
      .from('security_audit_logs')
      .insert({
        user_id: user.id,
        action: 'reseller_deleted',
        resource_type: 'reseller',
        resource_id: resellerId,
        success: true,
        details: {
          deleted_reseller_email: reseller.email,
          deleted_reseller_name: reseller.name,
          deleted_by: user.email,
          timestamp: new Date().toISOString()
        }
      });

    if (auditError) {
      console.error('Error logging to security audit:', auditError);
    } else {
      console.log('✅ Security audit log created');
    }

    console.log(`🎉 Successfully deleted reseller ${reseller.email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Reseller ${reseller.name} (${reseller.email}) has been permanently deleted.` 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in delete-reseller function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
