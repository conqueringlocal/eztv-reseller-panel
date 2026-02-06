// Shared M3U Domain Rewriting Utilities

export const DEFAULT_M3U_DOMAIN = Deno.env.get('DEFAULT_M3U_DOMAIN') || 'vpn.eztvclub.online';

export function rewriteM3uDomain(
  originalUrl: string | undefined | null,
  domainOverride: string | null | undefined,
  defaultDomain: string = DEFAULT_M3U_DOMAIN
): string | undefined {
  if (!originalUrl) return undefined;

  try {
    const url = new URL(originalUrl);
    const targetDomainRaw =
      domainOverride && domainOverride.trim() !== ''
        ? domainOverride.trim()
        : defaultDomain;

    const targetHost = targetDomainRaw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .trim();

    if (!targetHost) return originalUrl;
    url.host = targetHost;
    return url.toString();
  } catch {
    return originalUrl;
  }
}
