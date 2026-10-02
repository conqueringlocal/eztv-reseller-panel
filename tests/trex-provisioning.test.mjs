import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

const container = `eztv-trex-test-${process.pid}`;
const resellerId = '11111111-1111-4111-8111-111111111111';
const otherResellerId = '22222222-2222-4222-8222-222222222222';
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${q(JSON.stringify(value))}::jsonb`;
const sql = source => execFileSync('docker', ['exec', '-i', container, 'psql', '-XAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const query = source => JSON.parse(sql(source));
const customer = (overrides = {}) => ({ name: 'Fixture Customer', email: 'fixture@example.invalid',
  packageId: '27228', deviceType: 'Smart TV', planDuration: 1, connections: 1, ...overrides });
let handlerCode;
let feedback;

before(async () => {
  execFileSync('docker', ['run', '-d', '--name', container, '--network', 'none',
    '--label', 'eztv.disposable-test=true', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine'], { stdio: 'pipe' });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { sql('SELECT 1'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, 'disposable database started');
  sql(readFileSync(new URL('./trex-schema.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../supabase/migrations/20261002160000_trex_provisioning_guard.sql', import.meta.url), 'utf8'));
  handlerCode = (await transform(readFileSync(new URL('../supabase/functions/create-trex-user/index.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })).code;
  const feedbackCode = (await transform(readFileSync(new URL('../src/utils/customerCreationFeedback.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })).code;
  feedback = await import(`data:text/javascript;base64,${Buffer.from(feedbackCode).toString('base64')}`);
});
after(() => { execFileSync('docker', ['rm', '-f', '-v', container], { stdio: 'pipe' }); });
beforeEach(() => {
  sql(`TRUNCATE trex_provisioning_requests, credit_logs, customers, profiles CASCADE;
    INSERT INTO profiles VALUES (${q(resellerId)},100,'Fixture Reseller'),(${q(otherResellerId)},100,'Other Reseller');`);
});

const stats = () => query(`SELECT jsonb_build_object(
 'customers',(SELECT count(*) FROM customers), 'logs',(SELECT count(*) FROM credit_logs),
 'balance',(SELECT credits FROM profiles WHERE id=${q(resellerId)}),
 'requests',(SELECT count(*) FROM trex_provisioning_requests),
 'receipts',coalesce((SELECT sum(jsonb_array_length(receipts)) FROM trex_provisioning_requests),0));`);

async function setup(options = {}) {
  let handler;
  let trexHandler;
  const calls = [];
  const messages = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.invalidSession ? null : { id: resellerId } }, error: null }) },
    async rpc(name, args) {
      if (name === 'has_role') return { data: options.admin === true, error: null };
      if (options.guardFailure && name === 'claim_trex_provisioning') return { error: new Error('database unavailable') };
      if (options.finishFailure && name === 'finish_trex_provisioning') return { error: new Error('database unavailable') };
      try {
        const data = name === 'claim_trex_provisioning'
          ? query(`SELECT claim_trex_provisioning(${q(args.p_reseller_id)},${json(args.p_customer)},${args.p_charge_credits});`)
          : query(`SELECT finish_trex_provisioning(${q(args.p_request_id)},${args.p_error_code == null ? 'NULL' : q(args.p_error_code)});`);
        return { data, error: null };
      } catch { return { data: null, error: new Error('database operation failed') }; }
    },
    from(table) {
      let update;
      const filters = {};
      const chain = {
        select() { return chain; }, eq(key, value) { filters[key] = value; return chain; },
        update(value) { update = value; return chain; },
        async single() {
          if (table === 'profiles') return { data: { name: 'Fixture Reseller', provider: 'trex', use_admin_api: true }, error: null };
          if (table === 'system_settings') return { data: { value: options.noDefaultPackage ? null : '27228' }, error: null };
          if (table === 'customers') {
            return { data: query(`SELECT row_to_json(c) FROM customers c WHERE id=${q(filters.id)} AND reseller_id=${q(filters.reseller_id)}`), error: null };
          }
          if (options.receiptFailure) return { error: new Error('database unavailable') };
          const id = sql(`UPDATE trex_provisioning_requests SET receipts=${json(update.receipts)}, updated_at=now()
            WHERE id=${q(filters.id)} AND state=${q(filters.state)} RETURNING id;`).split('\n')[0];
          return { data: id ? { id } : null, error: null };
        },
      };
      return chain;
    },
  };
  const context = vm.createContext({
    Response, URL, URLSearchParams, AbortSignal,
    console: { log: value => messages.push(value), warn: value => messages.push(value), error: value => messages.push(value) },
    Deno: { env: { get: name => ({ TREX_CREATION_ENABLED: options.paused ? 'false' : 'true',
      SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
      TREX_API_KEY: options.noKey ? undefined : 'fixture-provider-key', TREX_PANEL_URL: 'https://provider.invalid/api/api.php' })[name] } },
    async fetch(url, init) {
      const parsed = new URL(url);
      if (parsed.hostname === 'database.invalid' && parsed.pathname === '/functions/v1/create-trex-user') {
        return trexHandler(new Request(url, init));
      }
      assert.equal(parsed.hostname, 'provider.invalid');
      assert.equal(parsed.searchParams.get('action'), 'new', 'never call device_info');
      assert.equal(init.redirect, 'error', 'never follow a create redirect');
      calls.push(parsed);
      if (options.provider) return options.provider(calls.length);
      return Response.json([{ status: 'true', user_id: String(calls.length),
        url: `https://stream.invalid/get.php?username=fixture${calls.length}%2Buser&password=fixture+password&type=m3u_plus` }]);
    },
  });
  const link = async specifier => {
    if (specifier.includes('/http/server.ts')) return new vm.SyntheticModule(['serve'], function () { this.setExport('serve', h => { handler = h; }); }, { context });
    if (specifier.includes('@supabase/supabase-js')) return new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', () => client); }, { context });
    throw new Error('Unexpected import');
  };
  const module = new vm.SourceTextModule(handlerCode, { context });
  await module.link(link);
  await module.evaluate();
  trexHandler = handler;
  if (options.generic) {
    const code = (await transform(readFileSync(new URL('../supabase/functions/create-iptv-user/index.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })).code;
    const generic = new vm.SourceTextModule(code, { context });
    await generic.link(link);
    await generic.evaluate();
  }
  const invoke = async (overrides = {}, token = 'fixture-user-token') => {
    const response = await handler(new Request('https://database.invalid', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resellerId, customerData: customer(), ...overrides }) }));
    return { status: response.status, body: await response.json() };
  };
  return { invoke, calls, messages, handler };
}

test('default pause and preflight do not call Trex', async () => {
  const app = await setup({ paused: true });
  assert.equal((await app.invoke()).status, 503);
  assert.equal((await app.handler(new Request('https://example.invalid', { method: 'OPTIONS' }))).status, 200);
  assert.equal(app.calls.length, 0);
});

test('documented URL/array response is saved once; literal and encoded plus survive', async () => {
  const app = await setup();
  const result = await app.invoke({ customerData: customer({ connections: 2 }) });
  assert.equal(result.body.success, true);
  assert.equal(result.body.customerCount, 2);
  assert.deepEqual(stats(), { customers: 1, logs: 1, balance: 98, requests: 1, receipts: 2 });
  const stored = query('SELECT connection_list FROM customers');
  assert.equal(stored[0].username, 'fixture1+user');
  assert.equal(stored[0].password, 'fixture+password');
  assert.equal(new URL(stored[0].m3u_url).searchParams.get('password'), 'fixture+password');
  assert.equal(app.calls.length, 2);
  for (const url of app.calls) {
    assert.ok(url.searchParams.get('note').includes(result.body.requestId));
    assert.ok(url.searchParams.get('note').includes(resellerId));
  }
  assert.ok(!JSON.stringify(app.messages).includes('fixture+password'));
  assert.ok(!JSON.stringify(result).includes('fixture+password'));
});

test('legacy top-level credentials still work', async () => {
  const app = await setup({ provider: () => Response.json({ status: true, username: 'fixture', password: 'fixture' }) });
  assert.equal((await app.invoke()).body.success, true);
});

test('five retries create and charge exactly once', async () => {
  const app = await setup();
  const first = await app.invoke();
  for (let i = 0; i < 5; i++) {
    const replay = await app.invoke();
    assert.equal(replay.body.alreadyProcessed, true);
    assert.equal(replay.body.requestId, first.body.requestId);
  }
  assert.equal(app.calls.length, 1);
  assert.deepEqual(stats(), { customers: 1, logs: 1, balance: 99, requests: 1, receipts: 1 });
});

test('concurrent submissions have one winning claim and one provider call', async () => {
  const app = await setup();
  const responses = await Promise.all(Array.from({ length: 5 }, () => app.invoke()));
  assert.equal(responses.filter(r => r.body.success).length, 1);
  assert.equal(app.calls.length, 1);
  assert.equal(stats().logs, 1);
});

test('provider timeout leaves permanent hold even after changed form data and a day passes', async () => {
  const app = await setup({ provider: () => { throw new Error('timeout with private credentials'); } });
  const first = await app.invoke();
  assert.equal(first.body.needsReview, true);
  sql("UPDATE trex_provisioning_requests SET created_at=now()-interval '2 days'");
  const retry = await app.invoke({ customerData: customer({ name: 'Changed Customer', connections: 3 }) });
  assert.equal(retry.status, 409);
  assert.equal(app.calls.length, 1);
  assert.equal(stats().balance, 100);
  assert.ok(!JSON.stringify(first).includes('private credentials'));
});

test('partial success saves confirmed lines, charges only those, and blocks buying again', async () => {
  const app = await setup({ provider: n => n === 1
    ? Response.json({ status: 'true', username: 'fixture', password: 'fixture' })
    : Response.json({ status: 'error', result: 'Insufficient provider credits' }) });
  const result = await app.invoke({ customerData: customer({ connections: 3 }) });
  assert.equal(result.body.success, false);
  assert.equal(result.body.customerCount, 1);
  assert.equal(result.body.needsReview, true);
  assert.equal(app.calls.length, 2, 'stop before third paid line');
  assert.equal(stats().balance, 99);
  assert.equal((await app.invoke()).status, 409);
  assert.equal(app.calls.length, 2);
});

test('receipt storage failure blocks retry even when no receipt can be persisted', async () => {
  const app = await setup({ receiptFailure: true });
  const first = await app.invoke({ customerData: customer({ connections: 3 }) });
  assert.equal(first.body.code, 'receipt_storage_failed');
  assert.equal((await app.invoke()).status, 409);
  assert.equal(app.calls.length, 1);
  assert.equal(stats().receipts, 0);
  assert.equal(stats().customers, 0);
});

test('final save failure retains receipt; later finalization never repurchases or double charges', async () => {
  const app = await setup({ finishFailure: true });
  const result = await app.invoke();
  assert.equal(result.body.code, 'customer_save_failed');
  assert.equal((await app.invoke()).status, 409);
  assert.equal(stats().receipts, 1);
  for (let i = 0; i < 2; i++) assert.equal(query(`SELECT finish_trex_provisioning(${q(result.body.requestId)},NULL)`).success, true);
  assert.equal(app.calls.length, 1);
  assert.equal(stats().balance, 99);
  assert.equal(stats().customers, 1);
  assert.equal(stats().logs, 1);
});

test('database claim failure fails closed before spending', async () => {
  const app = await setup({ guardFailure: true });
  assert.equal((await app.invoke()).body.code, 'guard_unavailable');
  assert.equal(app.calls.length, 0);
});

test('insufficient reseller credits never reaches Trex', async () => {
  sql(`UPDATE profiles SET credits=0 WHERE id=${q(resellerId)}`);
  const app = await setup();
  assert.equal((await app.invoke()).body.code, 'insufficient_credits');
  assert.equal(app.calls.length, 0);
});

test('forged internal flag and another reseller identity are rejected', async () => {
  const app = await setup();
  assert.equal((await app.invoke({ serviceCall: true })).status, 403);
  assert.equal((await app.invoke({ resellerId: otherResellerId })).status, 403);
  assert.equal(app.calls.length, 0);
});

test('admins have zero charge; authenticated internal calls retain normal charge', async () => {
  const admin = await setup({ admin: true });
  assert.equal((await admin.invoke()).body.creditsUsed, 0);
  assert.equal(stats().balance, 100);
  const internal = await setup();
  const result = await internal.invoke({ customerData: customer({ name: 'Internal Customer' }), serviceCall: true }, 'fixture-service-key');
  assert.equal(result.body.creditsUsed, 1);
  assert.equal(stats().balance, 99);
});

test('invalid input/configuration and expired sessions fail before a claim or provider call', async () => {
  const app = await setup();
  for (const patch of [{ connections: 0 }, { connections: 6 }, { planDuration: 99 }, { packageId: 'all' }, { macAddress: 'fixture-mac' }]) {
    assert.equal((await app.invoke({ customerData: customer(patch) })).status, 400);
  }
  assert.equal((await (await setup({ noKey: true })).invoke()).body.code, 'provider_configuration');
  assert.equal((await (await setup({ invalidSession: true })).invoke()).status, 401);
  assert.equal(app.calls.length, 0);
  assert.equal(stats().requests, 0);
});

test('malformed/negative/redirect responses never trigger automatic re-creation', async () => {
  for (const response of [new Response('not JSON'), Response.json({ status: 'false', username: 'fixture', password: 'fixture' }),
    Response.json({ status: 'true', user_id: 1 }), new Response(null, { status: 302 })]) {
    sql('TRUNCATE trex_provisioning_requests');
    const app = await setup({ provider: () => response });
    assert.equal((await app.invoke()).body.needsReview, true);
    assert.equal((await app.invoke()).status, 409);
    assert.equal(app.calls.length, 1);
  }
});

test('request receipts and privileged RPCs are inaccessible to browser roles', () => {
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => sql(`SET ROLE ${role}; SELECT * FROM trex_provisioning_requests;`));
    assert.throws(() => sql(`SET ROLE ${role}; SELECT claim_trex_provisioning(${q(resellerId)},${json(customer())},false);`));
    assert.throws(() => sql(`SET ROLE ${role}; SELECT finish_trex_provisioning(gen_random_uuid(),NULL);`));
  }
  assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='trex_provisioning_requests'::regclass"), 't');
});

test('separate database sessions contend atomically for one claim', async () => {
  const command = `SELECT claim_trex_provisioning(${q(resellerId)},${json(customer())},true);`;
  const concurrent = () => new Promise((resolve, reject) => {
    const proc = spawn('docker', ['exec', '-i', container, 'psql', '-XAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']);
    let output = '';
    proc.stdout.on('data', chunk => { output += chunk; });
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error('SQL claim failed')));
    proc.stdin.end(command);
  });
  const responses = await Promise.all(Array.from({ length: 5 }, concurrent));
  assert.equal(responses.filter(r => r.claimed).length, 1);
  assert.equal(new Set(responses.map(r => r.requestId)).size, 1);
});

test('customer, credit debit, and log creation roll back together on finalization failure', async () => {
  const app = await setup({ finishFailure: true });
  const result = await app.invoke();
  sql('ALTER TABLE credit_logs ADD CONSTRAINT test_reject_log CHECK (false)');
  try {
    assert.throws(() => sql(`SELECT finish_trex_provisioning(${q(result.body.requestId)},NULL)`));
    assert.deepEqual(stats(), { customers: 0, logs: 0, balance: 100, requests: 1, receipts: 1 });
  } finally { sql('ALTER TABLE credit_logs DROP CONSTRAINT test_reject_log'); }
});

test('frontend feedback never exposes arbitrary backend credentials or recommends retrying', () => {
  const secret = 'https://fixture.invalid/?password=secret';
  assert.ok(!feedback.customerCreationFailure({ error: secret }).includes(secret));
  assert.match(feedback.customerCreationFailure({ needsReview: true, requestId: resellerId, customerCount: 1 }), /1 connection/);
  assert.match(feedback.customerCreationFailure({ needsReview: true, requestId: resellerId }), /Do not create/);
  assert.equal(feedback.customerCreationFailure({ code: 'insufficient_credits', error: 'Insufficient credits. Required: 3, available: 1.' }), 'Insufficient credits. Required: 3, available: 1.');
});

test('legacy generic entrypoint preserves credentials and delegates charging only once', async () => {
  const app = await setup({ generic: true });
  const first = await app.invoke({ serviceCall: true, customerData: customer({ connections: 2 }) }, 'fixture-service-key');
  assert.equal(first.body.success, true);
  assert.equal(first.body.customers.length, 1);
  assert.equal(first.body.connectionList.length, 2);
  assert.equal(first.body.customer.id, first.body.customerId);
  assert.ok(first.body.connectionList.every(c => c.username && c.password && c.m3u_url));
  const replay = await app.invoke({ serviceCall: true, customerData: customer({ connections: 2 }) }, 'fixture-service-key');
  assert.equal(replay.body.alreadyProcessed, true);
  assert.equal(app.calls.length, 2);
  assert.equal(stats().balance, 98);
  assert.equal(stats().logs, 1);
});

test('only trusted upgrade callers can skip charging; stable line references permit distinct lines and block replay', async () => {
  const app = await setup({ generic: true });
  assert.equal((await app.invoke({ skipCredits: true, operationKey: 'upgrade:fixture:1' })).status, 403);
  for (const line of [1, 2, 1, 2]) {
    const result = await app.invoke({ serviceCall: true, skipCredits: true, operationKey: `upgrade:fixture:${line}` }, 'fixture-service-key');
    assert.equal(result.body.success, true);
  }
  assert.equal(app.calls.length, 2);
  assert.equal(stats().balance, 100, 'the upgrade caller owns its combined renewal and creation charge');
  assert.equal(stats().logs, 0, 'no duplicate audit debit or references to temporary upgrade rows');
});

test('legacy service default package resolves from configuration before any provider call', async () => {
  const app = await setup({ generic: true });
  const result = await app.invoke({ serviceCall: true, customerData: customer({ packageId: 'default' }) }, 'fixture-service-key');
  assert.equal(result.body.success, true);
  assert.equal(app.calls[0].searchParams.get('pack'), '27228');
  const unconfigured = await setup({ noDefaultPackage: true });
  assert.equal((await unconfigured.invoke({ serviceCall: true, customerData: customer({ packageId: 'default' }) }, 'fixture-service-key')).body.code, 'provider_configuration');
  assert.equal(unconfigured.calls.length, 0);
});

test('webhook consolidation reuses the guarded customer instead of inserting or deleting another', async () => {
  const app = await setup({ generic: true });
  const created = await app.invoke({ serviceCall: true, customerData: customer({ connections: 2 }) }, 'fixture-service-key');
  let inserts = 0;
  let deletes = 0;
  let updates = 0;
  let lookups = 0;
  const client = {
    functions: { invoke: async () => ({ data: created.body, error: null }) },
    from(table) {
      assert.equal(table, 'customers');
      const chain = {
        select() { return chain; }, eq() { return chain; }, neq() { return chain; },
        insert() { inserts++; return chain; }, delete() { deletes++; return chain; },
        update(data) { updates++; assert.equal(data.connection_list.length, 2); return chain; },
        async single() { lookups++; return { data: lookups === 1 ? null : created.body.customer, error: null }; },
      };
      return chain;
    },
  };
  const context = vm.createContext({ console: { log() {}, error() {}, warn() {} },
    Deno: { env: { get: () => 'fixture' } } });
  const source = readFileSync(new URL('../supabase/functions/webhook/enhancedWebhookHandler.ts', import.meta.url), 'utf8');
  const code = (await transform(source + '\nexport { createConsolidatedAccount };', { loader: 'ts', format: 'esm' })).code;
  const module = new vm.SourceTextModule(code, { context });
  await module.link(async specifier => {
    if (specifier.includes('@supabase/supabase-js')) return new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', () => client); }, { context });
    if (specifier.includes('highlevel-api')) return new vm.SyntheticModule(['updateHighLevelContact', 'getHighLevelSettings'], function () {
      this.setExport('updateHighLevelContact', () => { throw new Error('No HighLevel calls allowed'); });
      this.setExport('getHighLevelSettings', () => { throw new Error('No HighLevel calls allowed'); });
    }, { context });
    if (specifier.includes('m3u-domain')) return new vm.SyntheticModule(['rewriteM3uDomain', 'DEFAULT_M3U_DOMAIN'], function () {
      this.setExport('rewriteM3uDomain', value => value); this.setExport('DEFAULT_M3U_DOMAIN', 'stream.invalid');
    }, { context });
    throw new Error('Unexpected import');
  });
  await module.evaluate();
  const result = await module.namespace.createConsolidatedAccount({ connections: 2,
    customer: { name: 'Fixture Customer', email: 'fixture@example.invalid', plan_duration_months: 1 } }, resellerId, { credits: 100 });
  assert.equal(result.success, true);
  assert.equal(result.credentials.length, 2);
  assert.equal(inserts, 0);
  assert.equal(deletes, 0);
  assert.equal(updates, 1);
  assert.equal(stats().customers, 1);
  assert.equal(stats().balance, 98);
});
