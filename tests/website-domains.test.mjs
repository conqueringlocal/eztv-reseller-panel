import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  hostname,
  checkDns,
  checkTls,
  verifyDomain,
} from "../services/websites/domains.mjs";
import {
  createHandlers,
  validInquiry,
  makeBackend,
} from "../services/websites/server.mjs";
import { renderPage } from "../services/websites/render.mjs";
const host = "www.reseller-demo.com";
const domain = {
  hostname: host,
  reseller_id: "owner",
  verification_token: "proof",
  status: "pending",
  valid_until: new Date(Date.now() + 3600000).toISOString(),
};
const page = {
  brand_name: "Fixture Brand",
  headline: "Ask about service",
  description: "Customer support",
  contact_email: "help@example.com",
  accent_color: "#123456",
};
const form = {
  id: crypto.randomUUID(),
  name: "Test Visitor",
  email: "test@example.com",
  phone: "",
  device: "",
  message: "",
  contact_consent: true,
  marketing_consent: false,
};
test("host normalization rejects IPs, ports, internal and platform domains", () => {
  assert.equal(hostname("WWW.RESELLER-DEMO.COM"), host);
  for (const input of [
    "127.0.0.1",
    "www.example.com:443",
    "https://site.com",
    "site.local",
    "demo.pages.dev",
    "reseller.eztvclub.com",
    "-bad.com",
    "site.com.",
    "[::1]",
    "site.com/path",
  ])
    assert.equal(hostname(input), null, input);
  assert.equal(hostname("support.owner.com", ["owner.com"]), null);
});
test("DNS requires exact per-account ownership, only our IPv4, and no conflicting IPv6", async () => {
  const resolve =
    (overrides = {}) =>
    async (method) =>
      ({
        resolveTxt: [["pr", "oof"]],
        resolve4: ["192.0.2.10"],
        resolve6: [],
        ...overrides,
      })[method];
  assert.equal(await checkDns(domain, "192.0.2.10", resolve()), null);
  for (const overrides of [
    { resolveTxt: [["wrong"]] },
    { resolve4: [] },
    { resolve4: ["192.0.2.10", "127.0.0.1"] },
    { resolve6: ["::1"] },
  ])
    assert.ok(await checkDns(domain, "192.0.2.10", resolve(overrides)));
});
test("verification never publishes, failed checks revoke readiness, removed claims cannot activate", async () => {
  const calls = [];
  const gateway = async (a, b, c, data) => {
    calls.push(data);
    return { ...domain, ...data };
  };
  await verifyDomain(domain, {
    gateway,
    ipv4: "192.0.2.10",
    dns: async () => null,
    tls: async () => true,
  });
  assert.deepEqual(
    calls.map((x) => x.status),
    ["dns_verified", "ready"],
  );
  assert.ok(calls.every((x) => x.published === undefined));
  calls.length = 0;
  await verifyDomain(
    { ...domain, status: "ready" },
    {
      gateway,
      dns: async () => "Wrong DNS",
      tls: async () => {
        throw Error("should not run");
      },
    },
  );
  assert.deepEqual(
    calls.map((x) => x.status),
    ["pending"],
  );
  let probed = false;
  await verifyDomain(domain, {
    gateway: async () => null,
    dns: async () => null,
    tls: async () => {
      probed = true;
    },
  });
  assert.equal(probed, false);
  calls.length = 0;
  await verifyDomain(domain, {
    gateway,
    dns: async () => null,
    tls: async () => false,
  });
  assert.equal(calls.at(-1).status, "dns_verified");
});
test("TLS probe pins loopback, validates hostname and trust, and requires the matching proof", async () => {
  const dir = mkdtempSync(`${tmpdir()}/eztv-site-tls-`);
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        `${dir}/key`,
        "-out",
        `${dir}/cert`,
        "-days",
        "1",
        "-subj",
        `/CN=${host}`,
        "-addext",
        `subjectAltName=DNS:${host}`,
      ],
      { stdio: "ignore" },
    );
    const cert = readFileSync(`${dir}/cert`);
    let proof = "proof";
    const server = https
      .createServer({ key: readFileSync(`${dir}/key`), cert }, (req, res) => {
        assert.equal(req.headers.host, host);
        res.end(proof);
      })
      .listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const options = { port: server.address().port, ca: cert };
      assert.equal(await checkTls(domain, options), true);
      assert.equal(await checkTls(domain, { port: options.port }), false);
      assert.equal(
        await checkTls(
          { ...domain, hostname: "wrong.reseller-demo.com" },
          options,
        ),
        false,
      );
      proof = "wrong";
      assert.equal(await checkTls(domain, options), false);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
async function fixture(t, options = {}) {
  const calls = [];
  const gateway = async (action, owner, name, data) => {
    calls.push({ action, owner, name, data });
    return (
      options.results?.[action] ??
      {
        page,
        lookup: { ...domain, status: "ready" },
        preview: page,
        claim_check: domain,
        inquiry: "received",
      }[action]
    );
  };
  const handler = createHandlers({
    gateway,
    authenticate: async (header) =>
      header === "Bearer valid" ? "owner" : null,
    secret: "private-test-only",
    ipv4: "192.0.2.10",
    controlHost: "control.owner.com",
    dashboardOrigin: "https://reseller.eztvclub.com",
    blocked: ["owner.com"],
    verify: async () => ({ ...domain, message: "Verified", success: true }),
  });
  const server = http
    .createServer(options.internal ? handler.internal : handler.public)
    .listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const send = async (
    path = "/",
    { method = "GET", body, headers = {}, requestHost = host } = {},
  ) => {
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers: { host: requestHost, ...headers },
        },
        (response) => {
          let text = "";
          response.on("data", (chunk) => (text += chunk));
          response.on("end", () =>
            resolve({
              status: response.statusCode,
              headers: new Headers(response.headers),
              text,
            }),
          );
        },
      );
      request.on("error", reject);
      request.end(body === undefined ? undefined : JSON.stringify(body));
    });
  };
  return { send, calls };
}
test("public page resolves from actual Host, refuses fallback paths and has strict security headers", async (t) => {
  const f = await fixture(t);
  const result = await f.send();
  assert.equal(result.status, 200);
  assert.match(result.text, /Fixture Brand/);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.match(
    result.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(f.calls[0].name, host);
  for (const requestHost of [
    "reseller.eztvclub.com",
    "control.owner.com",
    "demo.pages.dev",
  ])
    assert.equal(
      (
        await f.send("/", {
          requestHost,
          headers: { "x-forwarded-host": host },
        })
      ).status,
      404,
    );
  assert.equal((await f.send("/r/fixture-page")).status, 404);
  assert.equal((await f.send("/tls-allowed?domain=" + host)).status, 404);
});
test("private management requires dashboard origin and verified JWT; preview is scriptless", async (t) => {
  const f = await fixture(t);
  const req = {
    method: "POST",
    requestHost: "control.owner.com",
    body: { action: "preview" },
  };
  assert.equal((await f.send("/reseller-websites/manage", req)).status, 403);
  assert.equal(
    (
      await f.send("/reseller-websites/manage", {
        ...req,
        headers: { origin: "https://reseller.eztvclub.com" },
      })
    ).status,
    401,
  );
  const result = await f.send("/reseller-websites/manage", {
    ...req,
    headers: {
      origin: "https://reseller.eztvclub.com",
      authorization: "Bearer valid",
    },
  });
  assert.equal(result.status, 200);
  assert.ok(!JSON.parse(result.text).html.includes("<script"));
  assert.equal(f.calls.at(-1).owner, "owner");
});
test("inquiry validates consent, ignores forged owner and slug, hashes trusted peer, and rejects cross-origin", async (t) => {
  const f = await fixture(t);
  const opts = {
    method: "POST",
    body: { ...form, reseller_id: "forged", slug: "forged" },
    headers: {
      origin: `https://${host}`,
      "x-website-client-ip": "192.0.2.1",
      "x-forwarded-for": "forged",
    },
  };
  assert.equal(
    (
      await f.send("/inquiry", {
        ...opts,
        headers: { origin: "https://attacker.com" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.send("/inquiry", {
        ...opts,
        body: { ...form, contact_consent: false },
      })
    ).status,
    400,
  );
  assert.equal((await f.send("/inquiry", opts)).status, 200);
  const last = f.calls.at(-1);
  assert.equal(last.name, host);
  assert.equal(last.data.inquiry.reseller_id, undefined);
  assert.equal(last.data.inquiry.slug, undefined);
  assert.match(last.data.ip_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(last).includes("192.0.2.1"));
});
test("gateway outages, throttles and oversized inputs never produce false success", async (t) => {
  const f = await fixture(t, { results: { inquiry: "rate_limited" } });
  assert.equal(
    (
      await f.send("/inquiry", {
        method: "POST",
        body: form,
        headers: { origin: `https://${host}` },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await f.send("/inquiry", {
        method: "POST",
        body: { ...form, message: "a".repeat(12000) },
        headers: { origin: `https://${host}` },
      })
    ).status,
    413,
  );
  assert.equal(validInquiry({ ...form, id: "invalid" }), false);
  assert.equal(validInquiry({ ...form, marketing_consent: "yes" }), false);
  const backend = makeBackend(
    {
      SUPABASE_URL: "https://backend.example.com",
      SUPABASE_ANON_KEY: "anon",
      WEBSITE_GATEWAY_SECRET: "secret",
    },
    async () => new Response("PRIVATE ERROR", { status: 500 }),
  );
  await assert.rejects(() => backend.gateway("page"), /gateway_unavailable/);
});
test("TLS permission endpoint denies arbitrary, pending and expired hosts", async (t) => {
  const f = await fixture(t, { internal: true });
  assert.equal((await f.send("/tls-allowed?domain=" + host)).status, 200);
  assert.equal(
    (await f.send("/tls-allowed?domain=reseller.eztvclub.com")).status,
    403,
  );
  const pending = await fixture(t, {
    internal: true,
    results: { lookup: domain },
  });
  assert.equal((await pending.send("/tls-allowed?domain=" + host)).status, 403);
  const expired = await fixture(t, {
    internal: true,
    results: {
      lookup: { ...domain, status: "ready", valid_until: "2000-01-01" },
    },
  });
  assert.equal((await expired.send("/tls-allowed?domain=" + host)).status, 403);
});
test("HTML escapes reseller content and never embeds private values", () => {
  const result = renderPage({
    ...page,
    brand_name: "<script>alert(1)</script>",
    description: '" onload="alert(1)',
    setup_notes: "PRIVATE GUIDE",
  });
  assert.ok(!result.html.includes("<script>alert(1)</script>"));
  assert.ok(!result.html.includes("PRIVATE GUIDE"));
  assert.match(result.html, /&lt;script&gt;/);
});
