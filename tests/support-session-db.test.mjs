import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { transform } from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const container = `eztv-support-${process.pid}`;
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
      /_legacy_credit_security.sql$|_trex_paid_operations.sql$|_legacy_sso_expiry.sql$|_provider_reconciliation_checks.sql$|_business_dashboard.sql$|_trex_balance_api.sql$|_admin_reseller_sessions.sql$/.test(
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
  sql(`UPDATE trex_balance_sync_state SET claim_id=NULL,checked_at=NULL,lease_until=NULL,last_attempt_at=NULL,last_success_at=NULL,last_error=NULL; TRUNCATE business_entries,provider_balance_checks,provider_reconciliation_checks,manual_credit_requests,credit_adjustments,trex_paid_operations,trex_provisioning_requests,credit_logs,credit_requests,renewal_transactions,customers,user_roles,profiles CASCADE;
 INSERT INTO profiles(id,name,email,role,credits) VALUES(${q(admin)},'Owner','a@example.invalid','admin',0),(${q(reseller)},'Reseller','r@example.invalid','reseller',20),(${q(other)},'Other','o@example.invalid','reseller',15);
 INSERT INTO user_roles(user_id,role) VALUES(${q(admin)},'admin'),(${q(reseller)},'reseller'),(${q(other)},'reseller');
 INSERT INTO customers(id,reseller_id,name,email,username,password,device_type,package_id,plan_duration,start_date,expiration_date,customer_group,connection_list)
 VALUES(${q(customer)},${q(reseller)},'Customer','c@example.invalid','fixture','secret','m3u','1',1,current_date,current_date+3,'group','[]');`);
});
test("only the service can claim sessions; only true administrators can inspect the audit", () => {
  for (const role of ["anon", "authenticated"])
    assert.equal(
      sql(
        `SELECT has_function_privilege(${q(role)},'claim_admin_reseller_session(uuid,uuid)','EXECUTE')`,
      ),
      "f",
    );
  assert.equal(
    sql(
      "SELECT has_table_privilege('authenticated','admin_reseller_sessions','INSERT')",
    ),
    "f",
  );
  sql(`SELECT claim_admin_reseller_session(${q(admin)},${q(reseller)})`);
  assert.equal(
    run("SELECT count(*) FROM admin_reseller_sessions", reseller),
    "0",
  );
  assert.equal(run("SELECT count(*) FROM admin_reseller_sessions", admin), "1");
});
test("claim rejects non-admin actors, admin targets and self login", () => {
  assert.throws(() =>
    sql(`SELECT claim_admin_reseller_session(${q(reseller)},${q(other)})`),
  );
  assert.throws(() =>
    sql(`SELECT claim_admin_reseller_session(${q(admin)},${q(admin)})`),
  );
  sql(`INSERT INTO user_roles(user_id,role) VALUES(${q(other)},'admin')`);
  assert.throws(() =>
    sql(`SELECT claim_admin_reseller_session(${q(admin)},${q(other)})`),
  );
});
test("concurrent creation enforces the rate cap and never changes credits or customer records", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 15 }, () =>
      concurrent(
        `SELECT claim_admin_reseller_session(${q(admin)},${q(reseller)})`,
      ),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 12);
  assert.equal(sql("SELECT count(*) FROM admin_reseller_sessions"), "12");
  assert.equal(
    sql(`SELECT credits FROM profiles WHERE id=${q(reseller)}`),
    "20",
  );
  assert.equal(sql("SELECT count(*) FROM customers"), "1");
});
