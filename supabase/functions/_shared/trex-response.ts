function rawQueryValue(url: string, name: string): string | undefined {
  const query = url.split('?')[1]?.split('#')[0];
  for (const part of query?.split('&') ?? []) {
    const split = part.indexOf('=');
    if (split >= 0 && part.slice(0, split) === name) return decodeURIComponent(part.slice(split + 1));
  }
}

export function parseCreationResponse(raw: unknown) {
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
