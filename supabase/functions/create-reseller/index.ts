
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MINIMUM_CREDITS_FOR_SUB_RESELLER = 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Create reseller function called');

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

    console.log('Admin client created');

    // Get the authorization header and verify the user is an admin or reseller
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

    // Check if the user is an admin or reseller using the admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, reseller_level')
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

    if (!profile || (profile.role !== 'admin' && profile.role !== 'reseller')) {
      console.log('User is not admin or reseller:', { profile, userRole: profile?.role });
      return new Response(JSON.stringify({ error: 'Insufficient permissions - admin or reseller role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User verified, parsing request body');

    // Parse the request body
    const { name, email, password, credits, provider, parent_reseller_id } = await req.json();

    console.log('Request data:', { name, email, credits, provider, parent_reseller_id });

    // Validate required fields
    if (!email || !password || !name) {
      console.log('Missing required fields');
      return new Response(JSON.stringify({ error: 'Missing required fields: name, email, and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate password length
    if (password.length < 6) {
      console.log('Password too short');
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters long' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate minimum credits for sub-resellers
    if (parent_reseller_id && (credits < MINIMUM_CREDITS_FOR_SUB_RESELLER)) {
      console.log('Credits below minimum for sub-reseller:', credits);
      return new Response(JSON.stringify({ 
        error: `Sub-resellers require a minimum of ${MINIMUM_CREDITS_FOR_SUB_RESELLER} credits. Provided: ${credits}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate provider
    if (provider && !['8k', 'trex'].includes(provider)) {
      console.log('Invalid provider');
      return new Response(JSON.stringify({ error: 'Invalid provider. Must be 8k or trex' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate reseller level
    let resellerLevel = 1;
    if (parent_reseller_id && profile.role === 'reseller') {
      // If this is a sub-reseller, increment the parent's level
      const { data: parentProfile } = await supabaseAdmin
        .from('profiles')
        .select('reseller_level')
        .eq('id', parent_reseller_id)
        .maybeSingle();
      
      if (parentProfile) {
        resellerLevel = (parentProfile.reseller_level || 1) + 1;
      }
    }

    console.log('Creating user account');

    // Create the user account using admin client
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto confirm email
      user_metadata: {
        name,
        role: 'reseller'
      }
    });

    if (authError) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!authData.user) {
      console.log('No user data returned');
      return new Response(JSON.stringify({ error: 'Failed to create user account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User created:', authData.user.id);

    // Update the profile with the correct data using admin client
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        credits: credits || 0,
        name: name,
        provider: provider || '8k',
        parent_reseller_id: parent_reseller_id || null,
        reseller_level: resellerLevel
      })
      .eq('id', authData.user.id);

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError);
      return new Response(JSON.stringify({ error: 'Failed to update reseller profile' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Profile updated successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      user: authData.user,
      message: 'Reseller created successfully' 
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
