// Single-purpose credential handoff. Never return plaintext secrets or log requests.
const encoder = new TextEncoder();
const mailbox = 'support@eztvclub.com';

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  } });
}

async function authenticated(request, expected) {
  if (typeof expected !== 'string' || expected.length < 43) return false;
  const supplied = request.headers.get('authorization') || '';
  if (supplied.length > 256) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${expected}`)),
  ]);
  const first = new Uint8Array(a), second = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < first.length; i++) difference |= first[i] ^ second[i];
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.pathname !== '/v1/mailbox' || url.search) return response(404, { error: 'not_found' });
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
    if (request.headers.has('origin')) return response(403, { error: 'browser_access_denied' });
    if (!await authenticated(request, env.VPS_HANDOFF_TOKEN)) return response(401, { error: 'unauthorized' });
    const expires = Date.parse(env.HANDOFF_EXPIRES_AT || '');
    if (env.HANDOFF_ENABLED !== 'true' || !Number.isFinite(expires) || expires <= Date.now()) {
      return response(410, { error: 'handoff_closed' });
    }
    if (!env.MAILBUX_APP_PASSWORD) return response(503, { error: 'mailbox_secret_missing' });
    const password = encoder.encode(env.MAILBUX_APP_PASSWORD);
    if (password.length > 256 || /[\r\n\0]/.test(env.MAILBUX_APP_PASSWORD)) {
      return response(422, { error: 'invalid_mailbox_secret' });
    }
    try {
      const der = Uint8Array.from(atob(env.VPS_PUBLIC_KEY_SPKI), char => char.charCodeAt(0));
      const publicKey = await crypto.subtle.importKey('spki', der,
        { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
      if (publicKey.algorithm.modulusLength !== 3072) throw new Error('Invalid key');
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, password));
      return response(200, { version: 1, algorithm: 'RSA-OAEP-256', mailbox,
        ciphertext: btoa(String.fromCharCode(...encrypted)) });
    } catch {
      return response(503, { error: 'handoff_configuration_error' });
    }
  },
};
