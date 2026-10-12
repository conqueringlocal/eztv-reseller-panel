import http from "node:http";
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hostname, verifyDomain } from "./domains.mjs";
import { renderPage } from "./render.mjs";
const safeHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};
export function validInquiry(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const field = (key, min, max) =>
    typeof body[key] === "string" &&
    body[key].trim().length >= min &&
    body[key].length <= max;
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.id || "",
    ) &&
    field("name", 2, 100) &&
    field("email", 3, 254) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) &&
    field("phone", 0, 40) &&
    field("device", 0, 100) &&
    field("message", 0, 1000) &&
    body.contact_consent === true &&
    typeof body.marketing_consent === "boolean" &&
    (body.referral == null ||
      (typeof body.referral === "string" && body.referral.length <= 100))
  );
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10000) throw new Error("payload");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    ...safeHeaders,
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
export function createHandlers({
  gateway,
  authenticate,
  secret,
  ipv4,
  controlHost,
  dashboardOrigin,
  blocked = [],
  verify = verifyDomain,
}) {
  const verifyOptions = { gateway, ipv4 };
  const unavailable = (res) =>
    send(
      res,
      404,
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Page unavailable</title><main><h1>Page unavailable</h1><p>This website is not published. Please check the address with your reseller.</p></main></html>',
      {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      },
    );
  return {
    async public(req, res) {
      try {
        const host = String(req.headers.host || "").toLowerCase();
        const path = new URL(req.url, "http://localhost").pathname;
        if (host === controlHost && path === "/reseller-websites/manage") {
          const origin = req.headers.origin;
          if (origin !== dashboardOrigin)
            return send(res, 403, { error: "Origin not allowed" });
          const cors = {
            "access-control-allow-origin": dashboardOrigin,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "authorization, content-type",
            vary: "Origin",
          };
          if (req.method === "OPTIONS") return send(res, 200, {}, cors);
          if (req.method !== "POST")
            return send(res, 405, { error: "Method not allowed" }, cors);
          const user = await authenticate(req.headers.authorization || "");
          if (!user)
            return send(
              res,
              401,
              { error: "Sign in again to manage your domain." },
              cors,
            );
          const body = await readBody(req);
          if (body.action === "preview") {
            const page = await gateway("preview", user);
            return page
              ? send(res, 200, { html: renderPage(page, true).html }, cors)
              : send(res, 404, { error: "Save your draft first." }, cors);
          }
          if (body.action !== "verify")
            return send(res, 400, { error: "Unknown action" }, cors);
          const domain = await gateway("claim_check", user);
          if (!domain)
            return send(
              res,
              429,
              {
                error:
                  "Wait 30 seconds before checking again, and make sure a domain is connected.",
              },
              cors,
            );
          if (!hostname(domain.hostname, blocked))
            return send(
              res,
              400,
              { error: "This address cannot be used as a reseller website." },
              cors,
            );
          const result = await verify(domain, verifyOptions);
          return send(
            res,
            200,
            {
              success: !!result,
              message:
                result?.message || "The domain changed. Refresh your settings.",
            },
            cors,
          );
        }
        if (!hostname(host, blocked)) return unavailable(res);
        if (path === "/.well-known/reseller-site" && req.method === "GET") {
          const domain = await gateway("lookup", null, host);
          if (
            !domain ||
            !["dns_verified", "ready"].includes(domain.status) ||
            Date.parse(domain.valid_until) <= Date.now()
          )
            return unavailable(res);
          return send(res, 200, domain.verification_token, {
            "content-type": "text/plain",
          });
        }
        if (path === "/" && (req.method === "GET" || req.method === "HEAD")) {
          const page = await gateway("page", null, host);
          if (!page) return unavailable(res);
          const result = renderPage(page);
          return send(res, 200, req.method === "HEAD" ? "" : result.html, {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": result.csp,
          });
        }
        if (path === "/inquiry" && req.method === "POST") {
          if (req.headers.origin !== `https://${host}`)
            return send(res, 403, {
              error: "Submit the form from this website.",
            });
          const body = await readBody(req);
          if (!validInquiry(body))
            return send(res, 400, {
              error: "Please check your contact details and consent.",
            });
          if (body.website) return send(res, 200, { success: true });
          const inquiry = Object.fromEntries(
            [
              "name",
              "email",
              "phone",
              "device",
              "message",
              "referral",
              "contact_consent",
              "marketing_consent",
            ].map((k) => [k, body[k]]),
          );
          // Caddy overwrites this header from its direct peer; incoming forwarded headers are ignored.
          const ip = String(
            req.headers["x-website-client-ip"] ||
              req.socket.remoteAddress ||
              "unknown",
          );
          const hash = createHmac("sha256", secret)
            .update(`website-inquiry:${ip}`)
            .digest("hex");
          const result = await gateway("inquiry", null, host, {
            id: body.id,
            inquiry,
            ip_hash: hash,
          });
          if (result === "rate_limited")
            return send(res, 429, {
              error:
                "Too many recent inquiries. Please try later or contact us by email.",
            });
          if (result !== "received")
            return send(res, 503, {
              error:
                "We could not confirm your inquiry. Retry the same form or contact us by email.",
            });
          return send(res, 200, { success: true });
        }
        return unavailable(res);
      } catch (error) {
        const cors =
          req.headers.origin === dashboardOrigin
            ? { "access-control-allow-origin": dashboardOrigin, vary: "Origin" }
            : {};
        return send(
          res,
          error.message === "payload" ? 413 : 503,
          {
            error:
              "This request could not be confirmed. Please try again shortly.",
          },
          cors,
        );
      }
    },
    async internal(req, res) {
      try {
        const url = new URL(req.url, "http://localhost");
        if (req.method !== "GET" || url.pathname !== "/tls-allowed")
          return send(res, 404, {});
        const host = hostname(url.searchParams.get("domain"), blocked);
        if (!host) return send(res, 403, {});
        const domain = await gateway("lookup", null, host);
        const allowed =
          domain &&
          ["dns_verified", "ready"].includes(domain.status) &&
          Date.parse(domain.valid_until) > Date.now();
        return send(res, allowed ? 200 : 403, {});
      } catch {
        return send(res, 503, {});
      }
    },
  };
}
export function makeBackend(env, fetcher = fetch) {
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    "content-type": "application/json",
  };
  return {
    async gateway(action, owner = null, host = null, data = {}) {
      const response = await fetcher(
        `${env.SUPABASE_URL}/rest/v1/rpc/sales_website_gateway`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_secret: env.WEBSITE_GATEWAY_SECRET,
            p_action: action,
            p_owner: owner,
            p_hostname: host,
            p_data: data,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error("gateway_unavailable");
      return response.json();
    },
    async authenticate(authorization) {
      if (!authorization.startsWith("Bearer ")) return null;
      const response = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const user = await response.json();
      return user.id || null;
    },
  };
}
export async function recheckDomains(gateway, options) {
  const domains = await gateway("list");
  for (let offset = 0; offset < domains.length; offset += 4) {
    await Promise.allSettled(
      domains.slice(offset, offset + 4).map(async (domain) => {
        if (
          domain.status === "pending" ||
          !hostname(domain.hostname, options.blocked)
        )
          return;
        const claimed = await gateway(
          "claim_check",
          domain.reseller_id,
          domain.hostname,
        );
        if (claimed) await verifyDomain(claimed, { gateway, ...options });
      }),
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const env = process.env;
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "WEBSITE_GATEWAY_SECRET",
    "WEBSITE_IPV4",
    "WEBSITE_CONTROL_HOST",
    "WEBSITE_DASHBOARD_ORIGIN",
  ])
    if (!env[name]) throw new Error(`Missing ${name}`);
  const backend = makeBackend(env);
  const blocked = (env.WEBSITE_BLOCKED_DOMAINS || "")
    .split(",")
    .filter(Boolean);
  const handlers = createHandlers({
    ...backend,
    secret: env.WEBSITE_GATEWAY_SECRET,
    ipv4: env.WEBSITE_IPV4,
    controlHost: env.WEBSITE_CONTROL_HOST,
    dashboardOrigin: env.WEBSITE_DASHBOARD_ORIGIN,
    blocked,
  });
  const servers = [
    http.createServer(handlers.public).listen(8095, "127.0.0.1"),
    http.createServer(handlers.internal).listen(8096, "127.0.0.1"),
  ];
  for (const server of servers) {
    server.requestTimeout = 30000;
    server.headersTimeout = 10000;
    server.maxHeadersCount = 40;
  }
  let running = false;
  const recheck = async () => {
    if (running) return;
    running = true;
    try {
      await recheckDomains(backend.gateway, {
        ipv4: env.WEBSITE_IPV4,
        blocked,
      });
    } catch {
      console.error(
        "Website verification sweep failed; expired domains remain unavailable.",
      );
    } finally {
      running = false;
    }
  };
  const interval = setInterval(recheck, 600000);
  void recheck();
  process.on("SIGTERM", () => {
    clearInterval(interval);
    for (const server of servers) server.close();
  });
}
