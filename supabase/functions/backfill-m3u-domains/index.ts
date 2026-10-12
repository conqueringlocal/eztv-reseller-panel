import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { rewriteM3uDomain, DEFAULT_M3U_DOMAIN } from '../_shared/m3u-domain.ts';

const BATCH_SIZE = 200;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const supabaseAuth = createClient(supabaseUrl, anonKey);

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  // Admin check
  const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin'
  });
  if (roleError || !isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { 
      status: 403, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  // Parse body
  let body: Record<string, unknown>;
  try { 
    body = await req.json(); 
  } catch { 
    body = {}; 
  }
  
  const resellerId = body?.reseller_id as string | undefined;
  if (!resellerId) {
    return new Response(JSON.stringify({ error: 'reseller_id is required' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  console.log('🔄 Starting M3U domain backfill:', { resellerId });

  // Load reseller override
  const { data: reseller, error: resellerErr } = await supabaseAdmin
    .from('profiles')
    .select('id, m3u_domain_override')
    .eq('id', resellerId)
    .single();

  if (resellerErr || !reseller) {
    return new Response(JSON.stringify({ error: 'Reseller not found' }), { 
      status: 404, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const domainOverride = (reseller as { id: string; m3u_domain_override?: string | null }).m3u_domain_override || null;
  console.log('🔗 Domain override present:', !!domainOverride);

  let customersProcessed = 0;
  let customersUpdated = 0;

  let from = 0;

  while (true) {
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, reseller_id, m3u_url, connection_list')
      .eq('reseller_id', resellerId)
      .range(from, from + BATCH_SIZE - 1);

    if (custErr) {
      console.error('❌ Failed to load customers batch');
      return new Response(JSON.stringify({ error: 'Failed to load customers' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (!customers || customers.length === 0) break;

    for (const customer of customers) {
      customersProcessed++;

      let needsUpdate = false;

      // Rewrite connection_list
      let rewrittenConnectionList: Array<Record<string, unknown>> | null = null;
      if (customer.connection_list && Array.isArray(customer.connection_list)) {
        rewrittenConnectionList = customer.connection_list.map((conn: Record<string, unknown>) => {
          const originalUrl = conn?.m3u_url as string | undefined;
          const newUrl = rewriteM3uDomain(originalUrl, domainOverride, DEFAULT_M3U_DOMAIN);
          if (newUrl !== originalUrl) needsUpdate = true;
          return { ...conn, m3u_url: newUrl };
        });
      }

      // Rewrite legacy m3u_url
      let rewrittenLegacyM3uUrl: string | null = null;
      if (customer.m3u_url) {
        const newLegacy = rewriteM3uDomain(customer.m3u_url, domainOverride, DEFAULT_M3U_DOMAIN) || null;
        rewrittenLegacyM3uUrl = newLegacy;
        if (newLegacy !== customer.m3u_url) needsUpdate = true;
      }

      if (!needsUpdate) continue;

      // Update DB row
      const updatePayload: Record<string, unknown> = {};
      if (rewrittenConnectionList) updatePayload.connection_list = rewrittenConnectionList;
      if (rewrittenLegacyM3uUrl !== null) updatePayload.m3u_url = rewrittenLegacyM3uUrl;

      const { error: updErr } = await supabaseAdmin
        .from('customers')
        .update(updatePayload)
        .eq('id', customer.id);

      if (updErr) {
        console.log('⚠️ Failed to update customer record');
        continue;
      }

      customersUpdated++;

    }

    console.log('📊 Backfill batch complete:', { 
      from, 
      processed: customersProcessed, 
      updated: customersUpdated, 
    });
    from += BATCH_SIZE;
  }

  console.log('✅ Backfill complete:', { 
    customersProcessed, 
    customersUpdated, 
  });

  return new Response(
    JSON.stringify({
      success: true,
      customersProcessed,
      customersUpdated,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
