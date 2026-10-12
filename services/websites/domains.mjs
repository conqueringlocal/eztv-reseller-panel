import { Resolver } from "node:dns/promises";
import https from "node:https";
const resolver = new Resolver({ timeout: 3000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
export function hostname(value, blocked = []) {
  if (typeof value !== "string") return null;
  const host = value.toLowerCase();
  if (
    host.length > 253 ||
    !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
  )
    return null;
  if (
    [
      "reseller.eztvclub.com",
      "supabase.eztvclub.com",
      "vpn.eztvclub.online",
      "pages.dev",
      "workers.dev",
      "hstgr.cloud",
      "localhost",
      "local",
      "internal",
      "invalid",
      "test",
      "example",
      "home.arpa",
      ...blocked,
    ].some((x) => host === x || host.endsWith(`.${x}`))
  )
    return null;
  return host;
}
async function records(method, name) {
  try {
    return await resolver[method](name);
  } catch (error) {
    if (["ENODATA", "ENOTFOUND"].includes(error.code)) return [];
    throw error;
  }
}
export async function checkDns(domain, ipv4, resolve = records) {
  const [txt, addresses, ipv6] = await Promise.all([
    resolve("resolveTxt", `_reseller-site.${domain.hostname}`),
    resolve("resolve4", domain.hostname),
    resolve("resolve6", domain.hostname),
  ]);
  if (!txt.some((parts) => parts.join("") === domain.verification_token))
    return "The ownership TXT record is missing or has not reached public DNS yet.";
  if (!addresses.length || addresses.some((ip) => ip !== ipv4) || ipv6.length)
    return "Point the A record to the address shown, remove conflicting A/AAAA records, and turn off DNS proxying.";
  return null;
}
// DNS never selects a fetch destination. Certificate validation still uses the reseller hostname.
export function checkTls(domain, { port = 443, ca } = {}) {
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: "127.0.0.1",
        port,
        servername: domain.hostname,
        headers: { host: domain.hostname },
        path: "/.well-known/reseller-site",
        rejectUnauthorized: true,
        ca,
        timeout: 18000,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 2048) req.destroy();
        });
        response.on("end", () =>
          resolve(
            response.statusCode === 200 && body === domain.verification_token,
          ),
        );
        response.on("error", () => resolve(false));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}
export async function verifyDomain(
  domain,
  { gateway, ipv4, dns = checkDns, tls = checkTls },
) {
  const status = (state, message) =>
    gateway("status", domain.reseller_id, domain.hostname, {
      verification_token: domain.verification_token,
      status: state,
      message,
    });
  try {
    const problem = await dns(domain, ipv4);
    if (problem) return await status("pending", problem);
    const allowed = await status(
      domain.status === "ready" ? "ready" : "dns_verified",
      "DNS verified. Preparing a secure HTTPS connection.",
    );
    if (!allowed) return null;
    if (!(await tls(domain)))
      return await status(
        "dns_verified",
        "DNS is verified. HTTPS is not ready yet; check again shortly. Check restrictive CAA records if this persists.",
      );
    return await status(
      "ready",
      "Your domain and HTTPS connection are ready. You can publish your page.",
    );
  } catch {
    return await status(
      "pending",
      "We could not verify the connection. Your draft is safe; check again shortly.",
    );
  }
}
