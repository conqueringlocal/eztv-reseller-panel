import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { transform } from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const container = `eztv-sales-${process.pid}`;
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
      /_legacy_credit_security.sql$|_trex_paid_operations.sql$|_legacy_sso_expiry.sql$|_provider_reconciliation_checks.sql$|_business_dashboard.sql$|_trex_balance_api.sql$|_reseller_sales_tools.sql$/.test(
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
test("private sales APIs and tables deny anonymous/direct writes; owner isolation applies", () => {
  for (const fn of [
    "get_sales_workspace()",
    "save_sales_lead(uuid,integer,uuid,jsonb)",
    "get_sales_program_summary()",
    "submit_public_sales_inquiry(uuid,text,jsonb,text)",
  ])
    assert.equal(
      sql(`SELECT has_function_privilege('anon',${q(fn)},'execute')`),
      "f",
    );
  assert.equal(
    sql(
      "SELECT has_function_privilege('authenticated','submit_public_sales_inquiry(uuid,text,jsonb,text)','execute')",
    ),
    "f",
  );
  for (const t of [
    "sales_leads",
    "sales_referral_rewards",
    "reseller_sales_pages",
  ])
    assert.equal(
      sql(`SELECT has_table_privilege('authenticated',${q(t)},'INSERT')`),
      "f",
    );
  save();
  assert.equal(workspace(other).leads.length, 0);
  assert.equal(run("SELECT count(*) FROM sales_leads", other), "0");
  assert.equal(run("SELECT count(*) FROM sales_leads", admin), "1");
  assert.throws(() => save(body(), id, 1, uuid(), other));
  assert.throws(() => run("SELECT get_sales_program_summary()", reseller));
});
test("concurrent lead retries create one lead and activity, conflicts reject", async () => {
  const query = as(
    reseller,
    `SELECT save_sales_lead(${q(id)},0,${q(second)},${q(JSON.stringify(body()))}::jsonb)`,
  );
  await Promise.all(Array.from({ length: 4 }, () => concurrent(query)));
  assert.equal(workspace().leads.length, 1);
  assert.equal(workspace().activities.length, 1);
  assert.throws(() => save(body({ name: "Changed" })));
  assert.throws(() => save(body(), id, 0, uuid()));
  save(body({ name: "Updated" }), id, 1, uuid());
  assert.equal(workspace().leads[0].revision, 2);
});
test("customer and referral associations must belong to the reseller; dates must be finite", () => {
  assert.throws(() =>
    save(body({ customer_id: customer }), id, 0, second, other),
  );
  const ref = run(
    `SELECT create_sales_referral(${q(customer)},'Referral')`,
    reseller,
  );
  assert.throws(() => save(body({ referral_id: ref }), id, 0, second, other));
  assert.throws(() => save(body({ follow_up_at: "infinity" })));
  assert.throws(() => save(body({ stage: "trial" })));
  save(body({ customer_id: customer, referral_id: ref }));
  assert.equal(workspace().leads[0].customer_id, customer);
});
test("paid records require receipt verification and preserve the original payment through full refunds", () => {
  const paid = body({
    stage: "paid",
    paid_amount: 30,
    payment_reference: "PAYMENT-1",
  });
  assert.throws(() => save(paid));
  assert.throws(() =>
    save({ ...paid, paid_amount: 0, payment_verified: true }),
  );
  save({ ...paid, payment_verified: true });
  assert.equal(workspace().metrics.paid_revenue_30d, 30);
  assert.throws(() => save({ ...paid, paid_amount: 31 }, id, 1, uuid()));
  assert.throws(() => save(body(), id, 1, uuid()));
  assert.throws(() =>
    save(
      { ...paid, stage: "refunded", refund_reference: "REFUND-1" },
      id,
      1,
      uuid(),
    ),
  );
  save(
    {
      ...paid,
      stage: "refunded",
      refund_reference: "REFUND-1",
      refund_verified: true,
    },
    id,
    1,
    uuid(),
  );
  assert.equal(workspace().metrics.paid_revenue_30d, 0);
  assert.equal(workspace().leads[0].paid_amount, 30);
  assert.throws(() => save(paid, id, 2, uuid()));
  assert.equal(
    sql(`SELECT credits FROM profiles WHERE id=${q(reseller)}`),
    "20",
  );
});
test("duplicate payment references cannot count twice", () => {
  save(
    body({
      stage: "paid",
      paid_amount: 30,
      payment_reference: "PAY-ONE",
      payment_verified: true,
    }),
  );
  assert.throws(() =>
    save(
      body({
        email: "another@example.invalid",
        stage: "paid",
        paid_amount: 30,
        payment_reference: "pay-one",
        payment_verified: true,
      }),
      uuid(),
      0,
      uuid(),
    ),
  );
});
test("conversation retries preserve time totals and follow-up schedule; opt-out blocks contact", () => {
  save();
  const call = `SELECT record_sales_contact(${q(customer)},${q(id)},'Spoke about setup',12,NULL)`;
  run(call, reseller);
  run(call, reseller);
  assert.equal(workspace().metrics.contact_minutes_30d, 12);
  assert.throws(() => run(call.replace("12,NULL", "13,NULL"), reseller));
  assert.throws(() => run(call, other));
  save(body({ do_not_contact: true }), id, 2, uuid());
  assert.throws(() => run(call.replace(customer, uuid()), reseller));
});
test("importing existing trials is idempotent and never provisions an account", () => {
  assert.throws(() =>
    run(`SELECT import_sales_trial(${q(customer)})`, reseller),
  );
  sql(`UPDATE customers SET is_trial=true WHERE id=${q(customer)}`);
  const a = run(`SELECT import_sales_trial(${q(customer)})`, reseller);
  assert.equal(run(`SELECT import_sales_trial(${q(customer)})`, reseller), a);
  const lead = workspace().leads[0];
  assert.equal(lead.stage, "setup");
  assert.equal(lead.trial_ends_at, null);
  assert.equal(sql("SELECT count(*) FROM customers"), "1");
  assert.equal(sql("SELECT count(*) FROM trex_paid_operations"), "0");
  assert.throws(() => run(`SELECT import_sales_trial(${q(customer)})`, other));
});
test("public pages require deliberate publication and expose only approved marketing fields", () => {
  page();
  assert.equal(sql("SELECT get_public_sales_page('fixture-page')"), "");
  assert.throws(() => page({ published: true }, 1));
  page({ published: true, public_details_confirmed: true }, 1);
  const pub = JSON.parse(
    sql("SET ROLE anon; SELECT get_public_sales_page('fixture-page')"),
  );
  assert.deepEqual(
    Object.keys(pub).sort(),
    [
      "slug",
      "brand_name",
      "headline",
      "description",
      "contact_email",
      "accent_color",
    ].sort(),
  );
  assert.ok(!JSON.stringify(pub).includes("PRIVATE"));
  page({}, 2);
  assert.equal(sql("SELECT get_public_sales_page('fixture-page')"), "");
});
test("parallel public retries and repeated email create one inquiry with contact consent", async () => {
  publish();
  await Promise.all(Array.from({ length: 4 }, () => concurrent(inquiry())));
  assert.equal(sql(inquiry(uuid())), "received");
  const w = workspace();
  assert.equal(w.leads.length, 1);
  assert.ok(w.leads[0].contact_requested_at);
  assert.equal(w.leads[0].marketing_opt_in_at, null);
  assert.equal(sql("SELECT count(*) FROM trex_paid_operations"), "0");
  assert.equal(
    sql(`SELECT credits FROM profiles WHERE id=${q(reseller)}`),
    "20",
  );
  assert.throws(() =>
    sql(
      inquiry(uuid(), "no@example.invalid", "a".repeat(64), {
        contact_consent: false,
      }),
    ),
  );
});
test("inquiry IP and page limits are enforced atomically", async () => {
  publish();
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      concurrent(inquiry(uuid(), `lead${i}@example.invalid`)),
    ),
  );
  assert.equal(results.filter((x) => x === "received").length, 5);
  assert.equal(workspace().leads.length, 5);
  sql(
    `INSERT INTO sales_inquiry_attempts(reseller_id,ip_hash) SELECT ${q(reseller)},repeat('b',64) FROM generate_series(1,25)`,
  );
  assert.equal(
    sql(inquiry(uuid(), "last@example.invalid", "c".repeat(64))),
    "rate_limited",
  );
});
test("disabled, cross-owner and malformed public referral identifiers are discarded", () => {
  publish();
  const ref = run(
    `SELECT create_sales_referral(${q(customer)},'Customer referral')`,
    reseller,
  );
  run(`SELECT set_sales_referral_enabled(${q(ref)},false)`, reseller);
  for (const referral of [ref, uuid(), "bad-value"]) {
    const key = uuid();
    sql(
      inquiry(
        key,
        `${key}@example.invalid`,
        key.replaceAll("-", "").repeat(2),
        { referral },
      ),
    );
    assert.equal(
      sql(`SELECT referral_id FROM sales_leads WHERE id=${q(key)}`),
      "",
    );
  }
});
test("rewards require paid referred sales, reject self-referrals and cannot double-issue anything", () => {
  const ref = run(
    `SELECT create_sales_referral(${q(customer)},'Customer referral')`,
    reseller,
  );
  save(body({ referral_id: ref }));
  const reward = `SELECT record_sales_reward(${q(id)},1,0,'GIFT-1','Already delivered')`;
  assert.throws(() => run(reward, reseller));
  const paid = body({
    stage: "paid",
    paid_amount: 30,
    payment_reference: "SALE-1",
    payment_verified: true,
    referral_id: ref,
  });
  save(paid, id, 1, uuid());
  run(reward, reseller);
  run(reward, reseller);
  assert.equal(workspace().rewards.length, 1);
  assert.throws(() => run(reward.replace("1,0,'GIFT", "2,0,'GIFT"), reseller));
  assert.equal(
    sql(`SELECT credits FROM profiles WHERE id=${q(reseller)}`),
    "20",
  );
  assert.equal(sql("SELECT count(*) FROM credit_logs"), "0");
  save(
    { ...paid, email: "c@example.invalid", payment_reference: "SALE-2" },
    uuid(),
    0,
    uuid(),
  );
  const self = workspace().leads.find((x) => x.email === "c@example.invalid");
  assert.throws(() => run(reward.replace(id, self.id), reseller));
});
test("admin program summary aggregates activity without exposing lead contact details", () => {
  save();
  const summary = JSON.parse(run("SELECT get_sales_program_summary()"));
  assert.equal(summary.length, 2);
  assert.ok(!JSON.stringify(summary).includes("lead@example.invalid"));
});
test("calculator preserves unknown costs, validates inputs and calculates a margin floor", async () => {
  const transformed = await transform(
    readFileSync("src/lib/sales.ts", "utf8"),
    { loader: "ts", format: "esm" },
  );
  const {
    calculateSalesQuote: calc,
    needsFollowUp,
    leadMessage,
  } = await import(
    "data:text/javascript;base64," +
      Buffer.from(transformed.code).toString("base64")
  );
  const inputs = {
    connections: 2,
    months: 3,
    unitCost: 3,
    price: 60,
    feePercent: null,
    fixedFee: null,
    supportCost: null,
    targetProfit: 10,
  };
  assert.equal(calc(inputs).net, null);
  assert.equal(calc(inputs).cost, 18);
  const r = calc({ ...inputs, feePercent: 3, fixedFee: 0.3, supportCost: 5 });
  assert.ok(Math.abs(r.net - 34.9) < 1e-8);
  assert.equal(r.minimumPrice, 34.33);
  assert.equal(calc({ ...inputs, connections: 0 }), null);
  assert.equal(calc({ ...inputs, feePercent: 100 }), null);
  assert.equal(needsFollowUp({ stage: "paid", follow_up_at: null }), false);
  assert.equal(needsFollowUp({ stage: "new", follow_up_at: null }), true);
  assert.equal(leadMessage({ do_not_contact: true }), "");
});
