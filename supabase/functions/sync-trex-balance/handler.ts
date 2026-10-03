export function parseTrexBalance(raw: unknown): number {
  const value = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_response');
  const data = value as Record<string, unknown>;
  if (data.status !== true && data.status !== 'true') throw new Error('provider_rejected');
  if (![true, 1, '1'].includes(data.enabled as never)) throw new Error('account_disabled');
  if (typeof data.credits !== 'string' && typeof data.credits !== 'number') throw new Error('invalid_balance');
  const text = String(data.credits).trim();
  const balance = Number(text);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(balance) || balance < 0 || balance > 1_000_000) throw new Error('invalid_balance');
  return balance;
}

const cors = { 'Access-Control-Allow-Origin': 'https://reseller.eztvclub.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
// The injected client is service-only and never returned to callers. Split for isolated tests.
export function createBalanceHandler(db: any, env: (name: string) => string | undefined, request: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return reply({});
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    try {
      let authorized = false;
      const scheduledToken = req.headers.get('X-Trex-Balance-Token');
      if (scheduledToken) {
        const check = await db.rpc('authorize_trex_balance_sync', { p_token: scheduledToken });
        authorized = !check.error && check.data === true;
      } else {
        const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
        if (!token) return reply({ error: 'Unauthorized' }, 401);
        const auth = await db.auth.getUser(token);
        if (auth.error || !auth.data?.user) return reply({ error: 'Unauthorized' }, 401);
        const role = await db.rpc('has_role', { _user_id: auth.data.user.id, _role: 'admin' });
        authorized = !role.error && role.data === true;
      }
      if (!authorized) return reply({ error: 'Unauthorized' }, 401);
      const claim = await db.rpc('claim_trex_balance_sync');
      if (claim.error || !claim.data) return reply({ error: 'Balance sync unavailable' }, 503);
      if (!claim.data.claimed) return reply({ success: claim.data.last_error == null, cached: true, syncing: claim.data.syncing === true });
      let credits: number | null = null;
      let errorCode: string | null = null;
      try {
        const key = env('TREX_API_KEY');
        const panel = env('TREX_PANEL_URL');
        if (!key || !panel) throw new Error('configuration');
        const url = new URL(panel);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('configuration');
        url.pathname = url.pathname.replace(/\/(api\/api\.php|player_api\.php)\/?$/, '').replace(/\/$/, '') + '/api/api.php';
        url.hash = '';
        // Fixed read-only action; caller-supplied data is never used in the provider request.
        url.search = new URLSearchParams({ action: 'reseller_info', api_key: key }).toString();
        const response = await request(url.toString(), { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', 'User-Agent': 'IPTV-Management-System/1.0' } });
        if (!response.ok) throw new Error('provider_unavailable');
        credits = parseTrexBalance(await response.json());
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        errorCode = ['configuration', 'provider_rejected', 'account_disabled', 'invalid_response', 'invalid_balance'].includes(code) ? code : 'provider_unavailable';
      }
      const saved = await db.rpc('finish_trex_balance_sync', { p_claim: claim.data.claim_id, p_credits: credits, p_error: errorCode });
      if (saved.error || saved.data !== true) return reply({ success: false, error: 'Balance check could not be saved. Previous balance retained.' }, 503);
      if (errorCode) return reply({ success: false, error: 'Trex balance could not be refreshed. Previous balance retained.' }, 503);
      return reply({ success: true, credits, checked_at: claim.data.checked_at });
    } catch { return reply({ success: false, error: 'Balance sync unavailable. Previous balance retained.' }, 503); }
  };
}
