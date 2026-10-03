import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const container = `eztv-sports-${process.pid}`,
  admin = "11111111-1111-4111-8111-111111111111",
  reseller = "22222222-2222-4222-8222-222222222222",
  id = "55555555-5555-4555-8555-555555555555";
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
const run = (role, who, query) =>
  sql(
    `BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claim.sub=${q(who)}; ${query}; COMMIT;`,
  );
const job = (
  kind = "configure",
  payload = { api_id: 123, api_hash: "private-fixture" },
) =>
  sql(
    `SELECT queue_sports_reader_job('${admin}','${id}',${q(kind)},${q(JSON.stringify(payload))})`,
  );
const poll = () => JSON.parse(sql("SELECT poll_sports_reader()"));
const ready = () =>
  sql(
    `UPDATE sports_reader_state SET phase='ready',channels='[{"id":"-100123","title":"Sports"}]'; SELECT configure_sports_source('${admin}','-100123','UTC',true)`,
  );
const post = (n = 1, content = "Schedule", edited = null) => ({
  source_id: "-100123",
  message_id: n,
  content,
  posted_at: "2026-10-03T12:00:00Z",
  edited_at: edited,
  media: [],
  media_notice: "",
  album_id: null,
  fingerprint: "x",
});
const ingest = (data, generation = 1) =>
  sql(
    `SELECT ingest_telegram_sports_post(${generation},${q(JSON.stringify(data))})`,
  );
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
  sql(
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role; CREATE TABLE profiles(id uuid PRIMARY KEY); CREATE TABLE user_roles(user_id uuid,role text); GRANT SELECT ON profiles TO authenticated; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid,bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT ON storage.objects TO anon,authenticated;`,
  );
  sql(readFileSync("tests/balance-scheduler-schema.sql", "utf8"));
  sql(
    readFileSync(
      "supabase/migrations/20261003213307_automatic_telegram_sports.sql",
      "utf8",
    ),
  );
});
after(() =>
  execFileSync("docker", ["rm", "-f", "-v", container], { stdio: "pipe" }),
);
beforeEach(() =>
  sql(
    `TRUNCATE sports_reader_jobs,telegram_sports_posts,profiles,user_roles,vault.secrets,storage.objects; DELETE FROM sports_reader_state; INSERT INTO sports_reader_state(id) VALUES(true); INSERT INTO profiles VALUES('${admin}'),('${reseller}'); INSERT INTO user_roles VALUES('${admin}','admin'),('${reseller}','reseller');`,
  ),
);
test("service secrets and ingestion are inaccessible to anon and reseller, including admin browser JWT", () => {
  for (const role of ["anon", "authenticated"])
    for (const fn of [
      "authorize_sports_reader(text)",
      "poll_sports_reader()",
      "queue_sports_reader_job(uuid,uuid,text,jsonb)",
      "ingest_telegram_sports_post(integer,jsonb)",
    ])
      assert.equal(
        sql(`SELECT has_function_privilege('${role}',${q(fn)},'EXECUTE')`),
        "f",
      );
  assert.equal(
    sql(
      "SELECT has_table_privilege('authenticated','sports_reader_state','SELECT')",
    ),
    "f",
  );
  assert.equal(
    sql(
      "SELECT has_table_privilege('authenticated','telegram_sports_posts','INSERT')",
    ),
    "f",
  );
  assert.throws(() => job("invalid"));
  assert.throws(() =>
    sql(`SELECT queue_sports_reader_job('${reseller}','${id}','code','{}')`),
  );
});
test("setup secrets are delivered once, destroyed at claim, replay is idempotent", () => {
  job();
  job();
  assert.equal(sql("SELECT count(*) FROM sports_reader_jobs"), "1");
  const result = poll();
  assert.equal(result.job.payload.api_hash, "private-fixture");
  assert.equal(sql("SELECT count(*) FROM vault.secrets"), "0");
  assert.equal(poll().job, null);
  sql(
    `SELECT finish_sports_reader_job('${id}','waiting_code',null,null); SELECT finish_sports_reader_job('${id}','ready',null,null)`,
  );
  assert.equal(sql("SELECT phase FROM sports_reader_state"), "waiting_code");
});
test("expired queued credentials are removed without disclosure", () => {
  job();
  sql("UPDATE sports_reader_jobs SET created_at=now()-interval '11 minutes'");
  assert.equal(poll().job, null);
  assert.equal(sql("SELECT count(*) FROM vault.secrets"), "0");
  assert.equal(sql("SELECT status FROM sports_reader_jobs"), "failed");
});
test("source membership, timezone, pause and generation prevent stale imports", () => {
  assert.throws(() =>
    sql(`SELECT configure_sports_source('${admin}','-100123','UTC',true)`),
  );
  ready();
  ingest(post());
  assert.throws(() =>
    sql(`SELECT configure_sports_source('${admin}','-100456','UTC',true)`),
  );
  assert.throws(() =>
    sql(`SELECT configure_sports_source('${admin}','-100123','BAD/ZONE',true)`),
  );
  sql(`SELECT configure_sports_source('${admin}','-100123','UTC',false)`);
  assert.throws(() => ingest(post(2)));
  assert.equal(sql("SELECT count(*) FROM telegram_sports_posts"), "1");
});
test("replayed posts never duplicate; late older edits cannot overwrite newer versions", () => {
  ready();
  ingest(post());
  ingest(post());
  ingest(post(1, "Corrected", "2026-10-03T13:00:00Z"));
  ingest(post(1, "Stale", "2026-10-03T12:30:00Z"));
  assert.equal(sql("SELECT count(*) FROM telegram_sports_posts"), "1");
  assert.equal(sql("SELECT content FROM telegram_sports_posts"), "Corrected");
});
test("private feed and attachments are unavailable anonymously, paging handles equal timestamps", () => {
  ready();
  for (let n = 1; n <= 101; n++) ingest(post(n));
  assert.throws(() => run("anon", "", "SELECT get_sports_feed()"));
  assert.throws(() =>
    run(
      "authenticated",
      "33333333-3333-4333-8333-333333333333",
      "SELECT get_sports_feed()",
    ),
  );
  const first = JSON.parse(
    run("authenticated", reseller, "SELECT get_sports_feed()"),
  );
  assert.equal(first.posts.length, 100);
  assert.equal(first.status.enabled, true);
  assert.equal(first.status.channels, undefined);
  const tail = first.posts.at(-1),
    second = JSON.parse(
      run(
        "authenticated",
        reseller,
        `SELECT get_sports_feed('${tail.posted_at}','${tail.id}')`,
      ),
    );
  assert.equal(second.posts.length, 1);
  assert.ok(!first.posts.some((p) => p.id === second.posts[0].id));
  sql(
    "INSERT INTO storage.objects VALUES(gen_random_uuid(),'sports-reader-media','fixture.jpg')",
  );
  assert.equal(run("anon", "", "SELECT count(*) FROM storage.objects"), "0");
  assert.equal(
    run("authenticated", reseller, "SELECT count(*) FROM storage.objects"),
    "1",
  );
  assert.equal(
    sql("SELECT public FROM storage.buckets WHERE id='sports-reader-media'"),
    "f",
  );
});
test("cursor never regresses and old generation sync cannot change current state", () => {
  ready();
  sql(
    "SELECT finish_sports_reader_sync(1,25,null); SELECT finish_sports_reader_sync(1,20,'sync_failed'); SELECT finish_sports_reader_sync(0,99,null)",
  );
  assert.equal(sql("SELECT cursor_id FROM sports_reader_state"), "25");
  assert.equal(
    sql("SELECT last_error_code FROM sports_reader_state"),
    "sync_failed",
  );
});
