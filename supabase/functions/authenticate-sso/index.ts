
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Hash the token for lookup (same way we store it)
    const encoder = new TextEncoder()
    const data = encoder.encode(token)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    console.log('Looking up token with hash:', tokenHash.substring(0, 8) + '...')

    // Look up the token in the database
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('sso_tokens')
      .select(`
        id,
        reseller_id,
        name,
        is_active,
        usage_count,
        profiles!reseller_id (
          id,
          email,
          name,
          role
        )
      `)
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single()

    if (tokenError || !tokenData) {
      console.error('Token lookup failed:', tokenError)
      
      // Log failed attempt
      await supabaseAdmin
        .from('sso_audit_logs')
        .insert({
          action: 'login_failed',
          ip_address: req.headers.get('x-forwarded-for'),
          user_agent: req.headers.get('user-agent'),
          additional_data: { error: 'Invalid token', token_prefix: token.substring(0, 8) }
        })

      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Found valid token for reseller:', tokenData.profiles.email)

    // Update token usage
    await supabaseAdmin
      .from('sso_tokens')
      .update({ 
        last_used_at: new Date().toISOString(),
        usage_count: tokenData.usage_count + 1
      })
      .eq('id', tokenData.id)

    // Log successful authentication
    await supabaseAdmin
      .from('sso_audit_logs')
      .insert({
        token_id: tokenData.id,
        reseller_id: tokenData.reseller_id,
        action: 'login_success',
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
        additional_data: { token_name: tokenData.name }
      })

    // Generate a session for the user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: tokenData.profiles.email,
      options: {
        redirectTo: `${req.headers.get('origin')}/reseller`
      }
    })

    if (authError || !authData) {
      console.error('Failed to generate auth session:', authError)
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: tokenData.profiles,
        redirect_url: authData.properties?.action_link || `/reseller`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('SSO authentication error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
