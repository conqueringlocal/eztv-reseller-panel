
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Update reseller provider function called');

    // Create Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the authorization header and verify the user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header');
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a regular supabase client to verify the requesting user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    console.log('Regular client created, checking user');

    // Get the user from the auth header
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.log('Invalid authorization:', userError);
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User found:', user.id);

    // Check if the user is an admin using the admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    console.log('Profile query result:', { profile, profileError });

    if (profileError) {
      console.log('Profile query error:', profileError);
      return new Response(JSON.stringify({ error: 'Error checking user permissions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile || profile.role !== 'admin') {
      console.log('User is not admin:', { profile, userRole: profile?.role });
      return new Response(JSON.stringify({ error: 'Insufficient permissions - admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Admin verified, parsing request body');

    // Parse the request body
    const { reseller_id, new_provider } = await req.json();

    console.log('Request data:', { reseller_id, new_provider });

    // Validate required fields
    if (!reseller_id || !new_provider) {
      console.log('Missing required fields');
      return new Response(JSON.stringify({ error: 'Missing required fields: reseller_id and new_provider are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate provider value
    const validProviders = ['8k', 'trex'];
    if (!validProviders.includes(new_provider)) {
      console.log('Invalid provider:', new_provider);
      return new Response(JSON.stringify({ error: 'Invalid provider. Must be one of: ' + validProviders.join(', ') }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current reseller info
    const { data: currentReseller, error: resellerError } = await supabaseAdmin
      .from('profiles')
      .select('name, email, provider')
      .eq('id', reseller_id)
      .eq('role', 'reseller')
      .maybeSingle();

    if (resellerError || !currentReseller) {
      console.log('Reseller not found or error:', resellerError);
      return new Response(JSON.stringify({ error: 'Reseller not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const oldProvider = currentReseller.provider || '8k';
    
    if (oldProvider === new_provider) {
      console.log('Provider is already set to:', new_provider);
      return new Response(JSON.stringify({ error: 'Reseller already has this provider' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Updating reseller provider from', oldProvider, 'to', new_provider);

    // Update the reseller's provider
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ provider: new_provider })
      .eq('id', reseller_id);

    if (updateError) {
      console.error('Provider update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update reseller provider' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Provider updated successfully');

    // Log the provider change
    const { error: logError } = await supabaseAdmin
      .from('credit_logs')
      .insert({
        reseller_id: reseller_id,
        action: 'admin_action',
        credits_used: 0,
        notes: `Provider changed from ${oldProvider} to ${new_provider} by admin (${user.email})`
      });

    if (logError) {
      console.error('Failed to log provider change:', logError);
      // Don't fail the entire operation for logging issues
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Provider updated from ${oldProvider} to ${new_provider}`,
      old_provider: oldProvider,
      new_provider: new_provider,
      reseller_name: currentReseller.name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
