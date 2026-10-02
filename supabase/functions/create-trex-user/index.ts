import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const reviewMessage = 'This attempt needs review. Do not create the customer again. Contact support with the request reference.';

// Trex returns credentials inside `url`, including in its documented one-item array response.
// URLSearchParams would turn literal + into spaces; these are credentials, not form data.
function rawQueryValue(url: string, name: string): string | undefined {
  const query = url.split('?')[1]?.split('#')[0];
  for (const part of query?.split('&') ?? []) {
    const split = part.indexOf('=');
    if (split >= 0 && part.slice(0, split) === name) return decodeURIComponent(part.slice(split + 1));
  }
}

function parseCreationResponse(raw: unknown) {
  const body = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('provider_response_unrecognized');
  const value = body as Record<string, unknown>;
  if (value.error || value.status === 'error' || value.status === false || value.status === 'false') {
    throw new Error('provider_rejected');
  }
  if (value.status !== true && value.status !== 'true' && value.success !== true) {
    throw new Error('provider_response_unrecognized');
  }
  const url = typeof value.url === 'string' ? value.url : '';
  const username = typeof value.username === 'string' && value.username ? value.username : rawQueryValue(url, 'username');
  const password = typeof value.password === 'string' && value.password ? value.password : rawQueryValue(url, 'password');
  if (!username || !password) throw new Error('provider_credentials_missing');
  const query = new URLSearchParams({ username, password, type: 'm3u_plus', output: 'ts' });
  return {
    username, password, accountRef: value.user_id == null ? null : String(value.user_id),
    m3uUrl: `http://vpn.eztvclub.online/get.php?${query}`,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ success: false, error: 'Method not allowed' }, 405);
  // Safe default for deployment: enable only after the migration + reconciliation checks.
  if (Deno.env.get('TREX_CREATION_ENABLED') !== 'true') {
    return reply({ success: false, code: 'creation_paused', error: 'Customer creation is temporarily paused. Contact support about an existing attempt.' }, 503);
  }

  let requestId: string | undefined;
  let client: ReturnType<typeof createClient> | undefined;
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!serviceKey || !supabaseUrl) throw new Error('backend_configuration');
    client = createClient(supabaseUrl, serviceKey);
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply({ success: false, error: 'Please sign in again.' }, 401);
    let input;
    try { input = await req.json(); } catch { return reply({ success: false, error: 'Invalid request.' }, 400); }
    const { resellerId, customerData, serviceCall = false } = input ?? {};
    const isInternal = token === serviceKey;
    // A caller-controlled serviceCall flag is never authorization.
    if (serviceCall && !isInternal) return reply({ success: false, error: 'Unauthorized service request.' }, 403);
    if ((input.skipCredits || input.operationKey) && !isInternal) {
      return reply({ success: false, error: 'Unauthorized service options.' }, 403);
    }
    if (input.operationKey && (typeof input.operationKey !== 'string' || !/^[a-zA-Z0-9:._-]{1,160}$/.test(input.operationKey))) {
      return reply({ success: false, error: 'Invalid operation reference.' }, 400);
    }
    let isAdmin = false;
    if (!isInternal) {
      const { data: { user }, error } = await client.auth.getUser(token);
      if (error || !user) return reply({ success: false, error: 'Your session expired. Please sign in again.' }, 401);
      const { data: admin, error: roleError } = await client.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (roleError) throw new Error('role_lookup_failed');
      isAdmin = admin === true;
      if (user.id !== resellerId && !isAdmin) return reply({ success: false, error: 'You cannot create accounts for this reseller.' }, 403);
    }
    if (isInternal && customerData && (!customerData.packageId || customerData.packageId === 'default')) {
      const { data: setting, error } = await client.from('system_settings').select('value')
        .eq('id', 'trex_default_package_id').single();
      if (error || !setting?.value || !/^\d+$/.test(String(setting.value))) {
        return reply({ success: false, code: 'provider_configuration', error: 'A numeric default Trex package must be configured. Contact support.' }, 400);
      }
      customerData.packageId = String(setting.value);
    }
    const connections = customerData?.maxConnections ?? customerData?.connections;
    const months = customerData?.planDuration;
    if (typeof resellerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(resellerId) || !customerData
      || !Number.isInteger(connections) || connections < 1 || connections > 5
      || ![1, 3, 6, 12].includes(months)
      || typeof customerData.name !== 'string' || !customerData.name.trim() || customerData.name.length > 200
      || typeof customerData.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.email) || customerData.email.length > 320
      || typeof customerData.packageId !== 'string' || !/^\d+$/.test(customerData.packageId)
      || typeof customerData.deviceType !== 'string' || !customerData.deviceType.trim()
      || customerData.macAddress || (customerData.accountType && customerData.accountType !== 'm3u')
      || customerData.isTrial) {
      return reply({ success: false, code: 'invalid_request', error: 'Check the customer details, numeric package, duration, and connection count. This endpoint creates paid M3U accounts only.' }, 400);
    }
    const { data: reseller, error: profileError } = await client.from('profiles')
      .select('name, provider, use_admin_api, api_key, panel_url').eq('id', resellerId).single();
    if (profileError || !reseller) return reply({ success: false, error: 'Reseller profile could not be loaded.' }, 404);
    if ((reseller.provider || 'trex') !== 'trex') return reply({ success: false, error: 'This reseller is not configured for Trex.' }, 400);
    const apiKey = reseller.use_admin_api ? Deno.env.get('TREX_API_KEY') : reseller.api_key;
    const panelUrl = reseller.use_admin_api ? Deno.env.get('TREX_PANEL_URL') : reseller.panel_url;
    if (!apiKey || !panelUrl) return reply({ success: false, code: 'provider_configuration', error: 'Trex connection settings are missing. Contact support.' }, 400);
    const endpoint = new URL(panelUrl);
    if (endpoint.protocol !== 'https:') throw new Error('provider_configuration');
    endpoint.pathname = endpoint.pathname.replace(/\/(api\/api\.php|player_api\.php)\/?$/, '').replace(/\/$/, '') + '/api/api.php';
    endpoint.search = '';
    endpoint.hash = '';
    const customer = {
      name: customerData.name.trim(), email: customerData.email.trim().toLowerCase(),
      deviceType: customerData.deviceType.trim(), packageId: customerData.packageId,
      planDuration: months, connections,
      operationKey: isInternal ? input.operationKey || 'create' : 'create',
      skipCredits: isInternal && input.skipCredits === true,
    };
    const { data: claim, error: claimError } = await client.rpc('claim_trex_provisioning', {
      p_reseller_id: resellerId, p_customer: customer, p_charge_credits: !isAdmin && !customer.skipCredits,
    });
    if (claimError || !claim) {
      // Without durable duplicate protection it is never safe to call the provider.
      return reply({ success: false, code: 'guard_unavailable', error: 'Customer creation is unavailable. No provider request was sent. Contact support.' }, 503);
    }
    if (!claim.claimed) {
      if (claim.state === 'completed') return reply({ ...claim.response, alreadyProcessed: true });
      if (claim.state === 'insufficient_credits') return reply({ success: false, code: 'insufficient_credits',
        error: `Insufficient credits. Required: ${claim.required}, available: ${claim.available}.` }, 400);
      return reply({ success: false, needsReview: true, code: 'request_already_pending',
        requestId: claim.requestId, error: reviewMessage }, 409);
    }
    requestId = claim.requestId;
    const receipts = [];
    let failure: string | null = null;
    for (let connection = 1; connection <= connections; connection++) {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        action: 'new', type: 'm3u', sub: String(months), pack: customer.packageId, api_key: apiKey,
        // Keep attribution first, even if the provider truncates notes. The durable ledger is authoritative.
        note: `EZTV ${requestId} | Reseller ${resellerId} ${reseller.name || ''} | Customer ${customer.name} | Line ${connection}/${connections}`,
      }).toString();
      try {
        // Exactly one call for this line. No HTTP retries or post-create device_info gate.
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': 'IPTV-Management-System/1.0', Accept: 'application/json', 'Cache-Control': 'no-cache' },
          redirect: 'error', signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error('provider_http_error');
        const receipt = parseCreationResponse(await response.json());
        receipts.push({ ...receipt, connectionNumber: connection });
        // Persist each successful receipt before attempting another paid line.
        const { data: saved, error: receiptError } = await client.from('trex_provisioning_requests')
          .update({ receipts, updated_at: new Date().toISOString() }).eq('id', requestId).eq('state', 'processing').select('id').single();
        if (receiptError || !saved) {
          // Leave the durable claim locked: provider success + storage failure must never trigger a new purchase.
          return reply({ success: false, needsReview: true, requestId, code: 'receipt_storage_failed', error: reviewMessage }, 503);
        }
      } catch (error) {
        const allowed = ['provider_rejected', 'provider_credentials_missing', 'provider_response_unrecognized', 'provider_http_error'];
        failure = error instanceof Error && allowed.includes(error.message) ? error.message : 'provider_outcome_unknown';
        // Even on timeout or malformed response, stop the remaining lines and block future attempts.
        break;
      }
    }
    const { data: result, error: finishError } = await client.rpc('finish_trex_provisioning', {
      p_request_id: requestId, p_error_code: failure,
    });
    if (finishError || !result) {
      return reply({ success: false, needsReview: true, requestId, code: 'customer_save_failed', error: reviewMessage }, 503);
    }
    // Log only references and outcomes, never URLs, credentials, customer payloads or raw provider responses.
    console.log(JSON.stringify({ event: 'trex_provisioning', requestId, code: result.code, customerCount: result.customerCount }));
    return reply(result);
  } catch {
    if (requestId) return reply({ success: false, needsReview: true, requestId, code: 'outcome_requires_review', error: reviewMessage }, 503);
    return reply({ success: false, code: 'creation_unavailable', error: 'Customer creation is unavailable. No provider request was sent. Contact support.' }, 503);
  }
});
