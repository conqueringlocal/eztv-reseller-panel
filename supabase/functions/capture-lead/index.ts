import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const {
      funnel_id,
      name,
      email,
      phone,
      utm_source,
      utm_medium,
      utm_campaign,
      additional_data
    } = body;

    console.log(`[Capture Lead] Processing lead for funnel: ${funnel_id}`);

    // Basic validation
    if (!funnel_id || !name || !email) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: funnel_id, name, email' 
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Verify funnel exists and is published
    const { data: funnel, error: funnelError } = await supabase
      .from('funnels')
      .select('id, name, is_published')
      .eq('id', funnel_id)
      .eq('is_published', true)
      .single();

    if (funnelError || !funnel) {
      console.error('[Capture Lead] Funnel not found or not published:', funnelError);
      return new Response(JSON.stringify({ 
        error: 'Invalid funnel' 
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Get client IP and user agent
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
    const userAgent = req.headers.get('user-agent') || '';

    // Insert lead data
    const { data: lead, error: insertError } = await supabase
      .from('funnel_leads')
      .insert([{
        funnel_id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        ip_address: clientIP || null,
        user_agent: userAgent || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        additional_data: additional_data || {}
      }])
      .select()
      .single();

    if (insertError) {
      console.error('[Capture Lead] Database insert error:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Failed to save lead data' 
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    console.log(`[Capture Lead] Successfully captured lead: ${lead.id} for ${email}`);

    // Update funnel analytics
    try {
      const { data: currentFunnel } = await supabase
        .from('funnels')
        .select('analytics')
        .eq('id', funnel_id)
        .single();

      const analytics = currentFunnel?.analytics || {};
      const today = new Date().toISOString().split('T')[0];
      
      analytics.total_visits = (analytics.total_visits || 0) + 1;
      analytics.total_leads = (analytics.total_leads || 0) + 1;
      analytics.daily_stats = analytics.daily_stats || {};
      analytics.daily_stats[today] = analytics.daily_stats[today] || { visits: 0, leads: 0 };
      analytics.daily_stats[today].leads += 1;

      await supabase
        .from('funnels')
        .update({ analytics })
        .eq('id', funnel_id);

    } catch (analyticsError) {
      console.error('[Capture Lead] Analytics update error:', analyticsError);
      // Don't fail the lead capture if analytics update fails
    }

    return new Response(JSON.stringify({ 
      success: true,
      lead_id: lead.id 
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('[Capture Lead] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});