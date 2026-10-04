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
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role; CREATE TABLE profiles(id uuid PRIMARY KEY); CREATE TABLE user_roles(user_id uuid,role text); GRANT SELECT ON profiles,user_roles TO authenticated; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid,bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO anon,authenticated; GRANT SELECT ON storage.objects TO anon,authenticated;`,
  );
  sql(readFileSync("tests/balance-scheduler-schema.sql", "utf8"));
  sql(
    readFileSync(
      "supabase/migrations/20261003213307_automatic_telegram_sports.sql",
      "utf8",
    ),
  );
  sql(
    readFileSync(
      "supabase/migrations/20261004014043_sports_today_us_feed.sql",
      "utf8",
    ),
  );
  sql(
    readFileSync(
      "supabase/migrations/20261004014924_sports_region_labels.sql",
      "utf8",
    ),
  );
  sql(
    readFileSync(
      "supabase/migrations/20261004021122_sports_schedule_verification.sql",
      "utf8",
    ),
  );
});
after(() =>
  execFileSync("docker", ["rm", "-f", "-v", container], { stdio: "pipe" }),
);
beforeEach(() =>
  sql(
    `TRUNCATE sports_event_checks,sports_reader_jobs,telegram_sports_posts,profiles,user_roles,vault.secrets,storage.objects; DELETE FROM sports_reader_state; INSERT INTO sports_reader_state(id) VALUES(true); INSERT INTO profiles VALUES('${admin}'),('${reseller}'); INSERT INTO user_roles VALUES('${admin}','admin'),('${reseller}','reseller');`,
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
    run("authenticated", admin, "SELECT get_sports_feed()"),
  );
  assert.equal(first.posts.length, 100);
  assert.equal(first.status.enabled, true);
  assert.equal(first.status.channels, undefined);
  const tail = first.posts.at(-1),
    second = JSON.parse(
      run(
        "authenticated",
        admin,
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
    run("authenticated", admin, "SELECT count(*) FROM storage.objects"),
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
const filter = (
  content,
  posted = "2026-10-03T12:00:00Z",
  today = "2026-10-03",
) =>
  sql(
    `SELECT coalesce(sports_us_today_content(${q(content)},${q(posted)},${q(today)}),'HIDDEN')`,
  );
const eventDay = (line, ref = "2026-10-03") =>
  sql(`SELECT sports_event_day(${q(line)},${q(ref)})`);
test("US footer qualifies shared events but foreign-only and unlabelled channels stay hidden", () => {
  assert.equal(
    filter(
      "Boxing 1 : A vs B 8pm\nUK| PPV EVENT\nUS| PPV EVENT\nEnjoy.\nTeam 8K",
    ),
    "Boxing 1 : A vs B 8pm\n\nUS| PPV EVENT",
  );
  assert.equal(filter("US team at 8pm\nCA| SPORTSNET"), "HIDDEN");
  assert.equal(
    filter("New Events For MAX US\nGame 1 @ Oct 3 8pm\nUK| MAX PPV"),
    "HIDDEN",
  );
  assert.equal(filter("Flo College 01 @ Oct 3 8pm\nFLO COLLEGE PPV"), "HIDDEN");
  assert.equal(
    filter("UK| SKY\nForeign game 1\nUS| ESPN\nUS game 2"),
    "HIDDEN",
  );
});
test("mixed-day posts retain only today’s event lines and remove stale totals", () => {
  const content =
    "New Events For Tennis\nTotal Events: 3\nTennis 01 @ Oct 2 8pm\nTennis 02 @ Oct 3 8pm\nTennis 03 @ Oct 4 8pm\nUS| TENNIS PPV";
  assert.equal(filter(content), "Tennis 02 @ Oct 3 8pm\n\nUS| TENNIS PPV");
  assert.equal(
    filter(content, "2026-10-02T12:00:00Z"),
    "Tennis 02 @ Oct 3 8pm\n\nUS| TENNIS PPV",
  );
  assert.equal(filter("Game 1 @ Oct 2 8pm\nUS| PPV"), "HIDDEN");
});
test("undated posts use original Eastern publication day, never edit/import time", () => {
  assert.match(
    filter("Game 1 at 8pm\nUS| PPV", "2026-10-04T01:00:00Z"),
    /Game 1/,
  );
  assert.equal(
    filter("Game 1 at 8pm\nUS| PPV", "2026-10-03T03:59:59Z"),
    "HIDDEN",
  );
  assert.equal(
    filter("Game 1 at 8pm\nUS| PPV", "2026-10-04T01:00:00Z", "2026-10-04"),
    "HIDDEN",
  );
  assert.match(
    filter("Game 1 at 8pm\nUS| PPV", "2026-11-01T04:30:00Z", "2026-11-01"),
    /Game 1/,
  );
  assert.equal(
    filter("Game 1 at 8pm\nUS| PPV", "2026-11-02T04:30:00Z", "2026-11-02"),
    "HIDDEN",
  );
});
test("Eastern date wins across midnight and provider start dates ignore following stop dates", () => {
  assert.equal(
    eventDay("Paramount 1 // UK Sun 4 Oct 1am // ET Sat 3 Oct 8pm"),
    "2026-10-03",
  );
  assert.equal(
    filter(
      "Paramount 1 // UK Sun 4 Oct 1am // ET Sat 3 Oct 8pm\nUS| PARAMOUNT",
    ),
    "Paramount 1 // ET Sat 3 Oct 8pm\n\nUS| PARAMOUNT",
  );
  assert.equal(
    eventDay("Peacock 01 start:2026-10-03 23:00:00 stop:2026-10-04 02:00:00"),
    "2026-10-03",
  );
  assert.equal(eventDay("Game 1 @ Jan 1 8pm", "2026-12-31"), "2027-01-01");
  assert.equal(eventDay("Game 1 @ Dec 31 8pm", "2027-01-01"), "2026-12-31");
  assert.equal(eventDay("Game 1 @ February 30 8pm"), "-infinity");
  assert.equal(filter("Game 1 @ 10/03/2026 8pm\nUS| PPV"), "HIDDEN");
});
test("reseller API is restricted to today, selected source and sanitized text; originals stay admin-only", () => {
  ready();
  const today = sql("SELECT (now() AT TIME ZONE 'America/New_York')::date"),
    yesterday = sql("SELECT (now() AT TIME ZONE 'America/New_York')::date-1");
  const latest = sql("SELECT now()");
  ingest({
    ...post(1, `Game 1 start:${today} 8pm\nUK| PPV\nUS| PPV`),
    posted_at: latest,
    media: [{ path: "fixture.jpg", mime: "image/jpeg" }],
  });
  ingest({
    ...post(2, `Old 2 start:${yesterday} 8pm\nUS| PPV`),
    posted_at: latest,
    edited_at: latest,
  });
  ingest({
    ...post(3, `Foreign 3 start:${today} 8pm\nCA| PPV`),
    posted_at: latest,
  });
  const feed = JSON.parse(
    run("authenticated", reseller, "SELECT get_sports_feed()"),
  );
  assert.equal(feed.status.scope, "us_today");
  assert.equal(feed.status.feed_date, today);
  assert.equal(feed.status.timezone, "America/New_York");
  assert.equal(feed.posts.length, 1);
  assert.deepEqual(feed.posts[0].media, []);
  assert.ok(!feed.posts[0].content.includes("UK|"));
  assert.equal(
    run(
      "authenticated",
      reseller,
      "SELECT count(*) FROM telegram_sports_posts",
    ),
    "0",
  );
  sql(
    "INSERT INTO storage.objects VALUES(gen_random_uuid(),'sports-reader-media','fixture.jpg')",
  );
  assert.equal(
    run("authenticated", reseller, "SELECT count(*) FROM storage.objects"),
    "0",
  );
  assert.equal(
    JSON.parse(run("authenticated", admin, "SELECT get_sports_feed()")).posts
      .length,
    3,
  );
  sql("UPDATE sports_reader_state SET source_id='-100999'");
  assert.equal(
    JSON.parse(run("authenticated", reseller, "SELECT get_sports_feed()")).posts
      .length,
    0,
  );
});

test("new country labels cannot leak into mixed US posts", () => {
  assert.equal(
    filter("Event 1 at 8pm\nJP| SPORTS 01\nMX| SPORTS 02\nUS| PPV"),
    "Event 1 at 8pm\n\nUS| PPV",
  );
  assert.equal(filter("Event 1 at 8pm\nJP| SPORTS 01"), "HIDDEN");
});
function verificationFixture() {
  ready();
  const today = sql("SELECT (now() AT TIME ZONE 'America/New_York')::date");
  ingest({
    ...post(1, `NHL Blackhawks at Sabres start:${today} 7pm ET\nUS| NHL PPV`),
    posted_at: sql("SELECT now()"),
  });
  const work = JSON.parse(sql("SELECT sports_verification_work()"));
  const row = work.posts[0];
  const item = {
    text: row.content.split("\n\n")[0],
    status: "verified",
    reason: "matched",
    source_name: "NHL",
    source_url: "https://www.nhl.com/gamecenter/123",
    start_at: today + "T23:00:00Z",
    event_state: "upcoming",
  };
  const save = (
    items = [item],
    hash = row.content_hash,
    day = today,
    generation = 1,
  ) =>
    sql(
      `SELECT save_sports_verification(${generation},${q(day)},${q(row.id)},${q(hash)},${q(JSON.stringify(items))})`,
    );
  return { today, row, item, save };
}
const resellerFeed = () =>
  JSON.parse(run("authenticated", reseller, "SELECT get_sports_feed()"));
test("verification work and results are service-only and raw base RPC is not a bypass", () => {
  for (const role of ["anon", "authenticated"])
    for (const fn of [
      "sports_verification_work()",
      "save_sports_verification(integer,date,uuid,text,jsonb)",
      "sports_verification_health(jsonb)",
      "get_sports_feed_base(timestamptz,uuid)",
    ])
      assert.equal(
        sql(`SELECT has_function_privilege('${role}',${q(fn)},'EXECUTE')`),
        "f",
      );
  assert.equal(
    sql(
      "SELECT has_table_privilege('authenticated','sports_event_checks','SELECT')",
    ),
    "f",
  );
});
test("saved evidence appears per event and stale evidence loses verification automatically", () => {
  const f = verificationFixture();
  f.save();
  let feed = resellerFeed();
  assert.equal(feed.posts[0].verification.items[0].status, "verified");
  assert.equal(feed.posts[0].verification.fresh, true);
  sql("UPDATE sports_event_checks SET checked_at=now()-interval '31 minutes'");
  feed = resellerFeed();
  assert.equal(feed.posts[0].verification.items[0].status, "unverified");
  assert.equal(feed.posts[0].verification.items[0].reason, "stale");
});
test("changed provider content invalidates evidence and stale worker writes are rejected", () => {
  const f = verificationFixture();
  f.save();
  sql(
    "UPDATE telegram_sports_posts SET content=replace(content,'Sabres','Bruins')",
  );
  assert.equal(resellerFeed().posts[0].verification.items[0].reason, "pending");
  assert.throws(() => f.save());
  assert.throws(() => f.save([f.item], f.row.content_hash, f.today, 99));
});
test("cancellations are withheld from reseller output but preserved in admin archive", () => {
  const f = verificationFixture();
  f.save([
    {
      ...f.item,
      status: "review",
      reason: "cancelled",
      event_state: "cancelled",
    },
  ]);
  const feed = resellerFeed();
  assert.equal(feed.posts.length, 0);
  assert.equal(feed.verification.withheld, 1);
  const adminFeed = JSON.parse(
    run("authenticated", admin, "SELECT get_sports_feed()"),
  );
  assert.equal(adminFeed.posts.length, 1);
  assert.equal(adminFeed.posts[0].verification.items[0].reason, "cancelled");
});
test("date conflicts and unverified listings remain visible for review", () => {
  const f = verificationFixture();
  f.save([{ ...f.item, status: "review", reason: "different_date" }]);
  assert.equal(
    resellerFeed().posts[0].verification.items[0].reason,
    "different_date",
  );
  f.save([
    { text: f.item.text, status: "unverified", reason: "source_unavailable" },
  ]);
  assert.equal(resellerFeed().posts.length, 1);
});
test("evidence cannot insert extra lines, change listing text, or link to untrusted sites", () => {
  const f = verificationFixture();
  assert.throws(() => f.save([{ ...f.item, text: "Injected event" }]));
  assert.throws(() => f.save([f.item, f.item]));
  assert.throws(() =>
    f.save([{ ...f.item, source_url: "https://evil.invalid" }]),
  );
  assert.throws(() => f.save([{ ...f.item, source_name: null }]));
  assert.throws(() => f.save([{ ...f.item, source_url: null }]));
});
