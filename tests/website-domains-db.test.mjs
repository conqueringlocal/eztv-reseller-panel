import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { transform } from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const container = `eztv-domains-${process.pid}`;
const admin = "11111111-1111-4111-8111-111111111111",
  reseller = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333",
  customer = "44444444-4444-4444-8444-444444444444",
  id = "55555555-5555-4555-8555-555555555555",
  second = "66666666-6666-4666-8666-666666666666";
const q = (x) => (x === null ? "NULL" : `'${String(x).replaceAll("'", "''")}'`);
const sql = (input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-h",
      "127.0.0.1",
      "-XqAt",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const as = (who, query) =>
  `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${q(who)}; ${query}; COMMIT;`;
const run = (query, who = admin) => sql(as(who, query));
const report = () =>
  JSON.parse(run("SELECT get_business_dashboard(current_date)"));
const entries = (
  kind,
  amount = 10,
  credits = 0,
  key = id,
  sale = null,
  ref = "FIXTURE",
  who = admin,
) =>
  run(
    `SELECT record_business_entry(${q(key)},${q(kind)},current_date,${amount},${credits},${q(reseller)},${q(ref)},'test',${q(sale)})`,
    who,
  );
const renewals = (who) => JSON.parse(run("SELECT get_renewal_worklist()", who));
const concurrent = (query) =>
  new Promise((resolve, reject) => {
    const p = spawn("docker", [
      "exec",
      "-i",
      container,
      "psql",
      "-h",
      "127.0.0.1",
      "-XqAt",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    let out = "",
      err = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (err += x));
    p.on("close", (code) =>
      code ? reject(new Error(err)) : resolve(out.trim()),
    );
    p.stdin.end(query);
  });
before(async () => {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      container,
      "--network",
      "none",
      "--label",
      "eztv.disposable-test=true",
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:17-alpine",
    ],
    { stdio: "pipe" },
  );
  for (let i = 0; i < 60; i++) {
    try {
      sql("SELECT 1");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  sql(readFileSync("tests/stabilization-schema.sql", "utf8"));
  sql(readFileSync("tests/balance-scheduler-schema.sql", "utf8"));
  const files = [
    "20261002160000_trex_provisioning_guard.sql",
    ...readdirSync("supabase/migrations").filter((x) =>
      /_legacy_credit_security.sql$|_trex_paid_operations.sql$|_legacy_sso_expiry.sql$|_provider_reconciliation_checks.sql$|_business_dashboard.sql$|_trex_balance_api.sql$|_reseller_sales_tools.sql$|_reseller_websites_coming_soon.sql$|_reseller_custom_domains.sql$|_reseller_website_domain_fix_logos.sql$/.test(
        x,
      ),
    ),
  ];
  for (const file of files)
    sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
});
after(() =>
  execFileSync("docker", ["rm", "-f", "-v", container], { stdio: "pipe" }),
);
beforeEach(() => {
  sql(
    "UPDATE reseller_website_settings SET enabled=true,ipv4='192.0.2.10',management_url='https://control.example.com/reseller-websites/manage',gateway_secret_hash=encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex')",
  );
  sql(`UPDATE trex_balance_sync_state SET claim_id=NULL,checked_at=NULL,lease_until=NULL,last_attempt_at=NULL,last_success_at=NULL,last_error=NULL; TRUNCATE business_entries,provider_balance_checks,provider_reconciliation_checks,manual_credit_requests,credit_adjustments,trex_paid_operations,trex_provisioning_requests,credit_logs,credit_requests,renewal_transactions,customers,user_roles,profiles CASCADE;
 INSERT INTO profiles(id,name,email,role,credits) VALUES(${q(admin)},'Owner','a@example.invalid','admin',0),(${q(reseller)},'Reseller','r@example.invalid','reseller',20),(${q(other)},'Other','o@example.invalid','reseller',15);
 INSERT INTO user_roles(user_id,role) VALUES(${q(admin)},'admin'),(${q(reseller)},'reseller'),(${q(other)},'reseller');
 INSERT INTO customers(id,reseller_id,name,email,username,password,device_type,package_id,plan_duration,start_date,expiration_date,customer_group,connection_list)
 VALUES(${q(customer)},${q(reseller)},'Customer','c@example.invalid','fixture','secret','m3u','1',1,current_date,current_date+3,'group','[]');`);
});
const body = (extra = {}) => ({
  name: "Test Lead",
  email: "lead@example.invalid",
  stage: "new",
  ...extra,
});
const save = (
  data = body(),
  key = id,
  revision = 0,
  command = second,
  who = reseller,
) =>
  run(
    `SELECT save_sales_lead(${q(key)},${revision},${q(command)},${q(JSON.stringify(data))}::jsonb)`,
    who,
  );
const workspace = (who = reseller) =>
  JSON.parse(run("SELECT get_sales_workspace()", who));
const page = (extra = {}, revision = 0, who = reseller) =>
  run(
    `SELECT save_sales_page(${revision},${q(JSON.stringify({ slug: "fixture-page", brand_name: "Fixture Brand", headline: "Ask about service", contact_email: "public@example.invalid", setup_notes: "PRIVATE GUIDE", ...extra }))}::jsonb)`,
    who,
  );
const publish = () => page({ published: true, public_details_confirmed: true });
const inquiry = (
  key = id,
  email = "public@example.invalid",
  hash = "a".repeat(64),
  extra = {},
) =>
  `SELECT submit_public_sales_inquiry(${q(key)},'fixture-page',${q(JSON.stringify({ name: "Public Lead", email, contact_consent: true, ...extra }))}::jsonb,${q(hash)})`;
const uuid = () => crypto.randomUUID();
const host = "www.reseller-demo.com";
const connect = (name = host, who = reseller) =>
  run(`SELECT connect_sales_domain(${q(name)})`, who);
const gwSql = (
  action,
  owner = null,
  name = null,
  data = {},
  secret = "a".repeat(64),
) =>
  `SELECT sales_website_gateway(${q(secret)},${q(action)},${q(owner)},${q(name)},${q(JSON.stringify(data))}::jsonb)`;
const gateway = (...args) => {
  const result = sql(`SET ROLE anon; ${gwSql(...args)}`);
  return result ? JSON.parse(result) : null;
};
const status = (
  state = "ready",
  token = workspace().domain.verification_token,
) =>
  gateway("status", reseller, host, {
    status: state,
    verification_token: token,
    message: "Fixture status",
  });
const ready = () => {
  page();
  connect();
  status();
};
const published = () => {
  ready();
  page({ published: true, public_details_confirmed: true }, 1);
};
test("draft stays private without a ready domain, including old clients and direct writes", () => {
  page();
  assert.equal(workspace().page.published, false);
  assert.throws(
    () => page({ published: true, public_details_confirmed: true }, 1),
    /verify your domain/,
  );
  assert.throws(
    () => sql("UPDATE reseller_sales_pages SET published=true"),
    /verify your domain/,
  );
  connect();
  assert.throws(
    () => page({ published: true, public_details_confirmed: true }, 1),
    /verify your domain/,
  );
  status("dns_verified");
  assert.throws(
    () => page({ published: true, public_details_confirmed: true }, 1),
    /verify your domain/,
  );
  assert.equal(gateway("page", null, host), null);
});
test("publishes only verified domains and never exposes private setup or old dashboard URLs", () => {
  published();
  assert.equal(workspace().page.published, true);
  const result = gateway("page", null, host);
  assert.equal(result.brand_name, "Fixture Brand");
  assert.ok(!JSON.stringify(result).includes("PRIVATE GUIDE"));
  assert.equal(
    sql("SET ROLE anon; SELECT get_public_sales_page('fixture-page') IS NULL"),
    "t",
  );
  assert.equal(gateway("page", null, "other.reseller-demo.com"), null);
  assert.throws(() => sql(inquiry()), /Use the reseller website/);
  assert.throws(
    () => page({ published: true, public_details_confirmed: false }, 2),
    /Confirm/,
  );
});
test("domain ownership is isolated and cannot be forged by a browser", () => {
  ready();
  page({ slug: "other-page" }, 0, other);
  assert.equal(workspace(other).domain, null);
  assert.equal(
    run("SELECT count(*) FROM reseller_website_domains", other),
    "0",
  );
  assert.throws(() => connect(host, other), /already connected/);
  assert.throws(
    () => run("UPDATE reseller_website_domains SET status='ready'", reseller),
    /permission denied/,
  );
  assert.throws(
    () => gateway("status", reseller, host, {}, "wrong-secret"),
    /unavailable/,
  );
  assert.throws(
    () =>
      run(
        "SELECT gateway_secret_hash FROM reseller_website_settings",
        reseller,
      ),
    /permission denied/,
  );
  assert.equal(workspace().website_hosting.gateway_secret_hash, undefined);
  assert.equal(
    sql(
      "SELECT has_function_privilege('authenticated','submit_domain_sales_inquiry_internal(uuid,text,jsonb,text)','execute')",
    ),
    "f",
  );
  assert.equal(
    sql(
      "SELECT has_function_privilege('anon','get_sales_workspace_without_domain()','execute')",
    ),
    "f",
  );
});
test("hostname errors distinguish malformed input from reserved service addresses", () => {
  page();
  for (const name of [
    "reseller.eztvclub.com",
    "supabase.eztvclub.com",
    "vpn.eztvclub.online",
    "sub.reseller.eztvclub.com",
    "demo.pages.dev",
    "demo.invalid",
  ]) {
    assert.throws(
      () => connect(name),
      /reserved for the dashboard or platform services/,
    );
  }
  for (const name of [
    "localhost",
    "127.0.0.1",
    "www.demo.com:443",
    "https://demo.com",
    "www.demo.com/path",
    "www.-bad.com",
    "a..com",
    "*.demo.com",
  ]) {
    assert.throws(() => connect(name), /Enter a domain name without/);
  }
});
test("owner apex and www domains are accepted but remain unpublished pending ownership proof", () => {
  page();
  for (const name of [
    "eztvclub.com",
    "www.eztvclub.com",
    "eztvclub.online",
    "www.eztvclub.online",
    "WWW.RESELLER-DEMO.COM",
  ]) {
    connect(name);
    assert.equal(workspace().domain.hostname, name.toLowerCase());
    assert.equal(workspace().domain.status, "pending");
    assert.equal(workspace().page.published, false);
    assert.throws(
      () => page({ published: true, public_details_confirmed: true }, 1),
      /verify your domain/,
    );
    run("SELECT disconnect_sales_domain()", reseller);
  }
});
test("disconnect unpublishes atomically, preserves leads/drafts, and invalidates old verification", () => {
  published();
  const old = workspace().domain.verification_token;
  gateway("inquiry", null, host, {
    id,
    ip_hash: "c".repeat(64),
    inquiry: {
      name: "Visitor Name",
      email: "visitor@example.invalid",
      contact_consent: true,
      marketing_consent: false,
    },
  });
  run("SELECT disconnect_sales_domain()", reseller);
  assert.equal(workspace().page.published, false);
  assert.equal(workspace().domain, null);
  assert.equal(workspace().page.setup_notes, "PRIVATE GUIDE");
  assert.equal(workspace().leads.length, 1);
  assert.equal(gateway("page", null, host), null);
  assert.equal(gateway("inquiry", null, host, { id: uuid() }), null);
  connect();
  assert.notEqual(workspace().domain.verification_token, old);
  assert.equal(status("ready", old), null);
  assert.equal(workspace().domain.status, "pending");
});
test("expired checks, failed DNS and disabled hosting fail closed", () => {
  published();
  sql(
    "UPDATE reseller_website_domains SET valid_until=now()-interval '1 second'",
  );
  assert.equal(workspace().page.published, false);
  assert.equal(gateway("page", null, host), null);
  status();
  page(
    { published: true, public_details_confirmed: true },
    workspace().page.revision,
  );
  status("pending");
  assert.equal(workspace().page.published, false);
  sql("UPDATE reseller_website_settings SET enabled=false");
  assert.throws(() => connect(), /not configured/);
  assert.throws(() => gateway("page", null, host), /unavailable/);
});
test("custom-domain inquiries retain rate limits, deduplication, referrals and reseller isolation", () => {
  published();
  const ref = run(
    `SELECT create_sales_referral(${q(customer)},'Referral')`,
    reseller,
  );
  const payload = {
    id,
    ip_hash: "d".repeat(64),
    inquiry: {
      name: "Visitor Name",
      email: "visitor@example.invalid",
      referral: ref,
      contact_consent: true,
      marketing_consent: false,
    },
  };
  assert.equal(gateway("inquiry", null, host, payload), "received");
  assert.equal(gateway("inquiry", null, host, payload), "received");
  assert.equal(workspace().leads.length, 1);
  assert.equal(workspace().leads[0].referral_id, ref);
  assert.equal(workspace(other).leads.length, 0);
  for (let i = 0; i < 4; i++)
    assert.equal(
      gateway("inquiry", null, host, {
        ...payload,
        id: uuid(),
        inquiry: { ...payload.inquiry, email: `visitor${i}@example.invalid` },
      }),
      "received",
    );
  assert.equal(
    gateway("inquiry", null, host, {
      ...payload,
      id: uuid(),
      inquiry: { ...payload.inquiry, email: "limit@example.invalid" },
    }),
    "rate_limited",
  );
  assert.equal(sql("SELECT count(*) FROM credit_logs"), "0");
});
test("verification requests are throttled and private preview needs no domain", () => {
  page();
  assert.equal(gateway("preview", reseller).brand_name, "Fixture Brand");
  assert.equal(gateway("preview", other), null);
  connect();
  assert.equal(gateway("claim_check", reseller).hostname, host);
  assert.equal(gateway("claim_check", reseller), null);
});
test("concurrent publishing and disconnect always end private", async () => {
  ready();
  await Promise.allSettled([
    concurrent(
      as(
        reseller,
        `SELECT save_sales_page(1,'{"slug":"fixture-page","brand_name":"Fixture Brand","headline":"Headline","contact_email":"test@example.invalid","published":true,"public_details_confirmed":true}')`,
      ),
    ),
    concurrent(as(reseller, "SELECT disconnect_sales_domain()")),
  ]);
  assert.equal(workspace().domain, null);
  assert.equal(workspace().page.published, false);
});

const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=";
test("logos stay private until publishing and survive older-client saves", () => {
  page({ logo_data_url: logo });
  assert.equal(workspace().page.logo_data_url, logo);
  assert.equal(gateway("preview", reseller).logo_data_url, logo);
  assert.equal(gateway("preview", other), null);
  assert.equal(gateway("page", null, host), null);
  page({ headline: "Updated without a logo field" }, 1);
  assert.equal(workspace().page.logo_data_url, logo);
  connect();
  status();
  page({ published: true, public_details_confirmed: true }, 2);
  assert.equal(gateway("page", null, host).logo_data_url, logo);
  page(
    { logo_data_url: "", published: true, public_details_confirmed: true },
    3,
  );
  assert.equal(gateway("page", null, host).logo_data_url, null);
});
test("invalid logo URLs, active content, malformed PNGs and oversized images are rejected without losing saved content", () => {
  page({ logo_data_url: logo });
  const huge = Buffer.from(logo.split(",")[1], "base64");
  huge.writeUInt32BE(10000, 16);
  for (const invalid of [
    "https://example.com/logo.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,ZmFrZQ==",
    "data:image/png;base64," + "a".repeat(262145),
    "data:image/png;base64," + huge.toString("base64"),
  ]) {
    assert.throws(
      () => page({ logo_data_url: invalid }, 1),
      /upload a PNG, JPG or WebP logo/,
    );
  }
  assert.equal(workspace().page.logo_data_url, logo);
  assert.throws(
    () => run("UPDATE reseller_sales_pages SET logo_data_url=null", other),
    /permission denied/,
  );
  page({ logo_data_url: null }, 1);
  assert.equal(workspace().page.logo_data_url, null);
});
