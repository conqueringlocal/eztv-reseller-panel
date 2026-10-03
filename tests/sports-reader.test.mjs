import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
const compiled = await transform(
  readFileSync("supabase/functions/sports-reader/handler.ts", "utf8"),
  { loader: "ts", format: "esm" },
);
const { createSportsHandler } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64")
);
const id = "11111111-1111-4111-8111-111111111111";
function fixture(opts = {}) {
  const calls = [];
  const db = {
    auth: {
      getUser: async () =>
        opts.badAuth
          ? { error: {} }
          : {
              data: {
                user: { id, factors: opts.mfa ? [{ status: "verified" }] : [] },
              },
            },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "has_role") return { data: !opts.reseller };
      if (name === "authorize_sports_reader")
        return { data: args.p_token === "w".repeat(64) };
      return opts.dbError
        ? { error: { message: "PRIVATE" } }
        : { data: { ok: true } };
    },
    from: () => ({
      select() {
        return this;
      },
      single: async () => ({
        data: { enabled: true, source_id: "-100123", generation: 1 },
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path, bytes, options) => {
          calls.push(["upload", { path, size: bytes.length, options }]);
          return { data: { path } };
        },
      }),
    },
  };
  const handler = createSportsHandler(db);
  const request = async (body, worker = false, token = "valid") =>
    handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: worker
          ? {
              "x-sports-reader-token":
                token === "valid" ? "w".repeat(64) : token,
            }
          : { authorization: "Bearer " + token },
        body: JSON.stringify(body),
      }),
    );
  return { calls, request, handler };
}
test("anonymous, invalid tokens, reseller and admin MFA bypass attempts are rejected", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.handler(
        new Request("https://fixture.invalid", { method: "POST", body: "{}" }),
      )
    ).status,
    401,
  );
  assert.equal(
    (await f.request({ action: "poll" }, true, "wrong")).status,
    401,
  );
  assert.equal(
    (await fixture({ badAuth: true }).request({ action: "status" })).status,
    401,
  );
  assert.equal(
    (await fixture({ reseller: true }).request({ action: "status" })).status,
    403,
  );
  const token =
    "h." + Buffer.from('{"aal":"aal1"}').toString("base64url") + ".s";
  assert.equal(
    (
      await fixture({ mfa: true }).request(
        { action: "configure" },
        false,
        token,
      )
    ).status,
    403,
  );
});
test("worker and admin action surfaces remain separate", async () => {
  const f = fixture();
  assert.equal((await f.request({ action: "poll" })).status, 400);
  assert.equal(
    (await f.request({ action: "configure", id }, true)).status,
    400,
  );
  assert.equal((await f.request({ action: "poll" }, true)).status, 200);
});
test("admin setup drops unexpected secrets and only queues validated inputs", async () => {
  const f = fixture();
  const result = await f.request({
    action: "configure",
    id,
    api_id: 123,
    api_hash: "a".repeat(32),
    phone: "+10000000000",
    extra: "PRIVATE",
  });
  assert.equal(result.status, 200);
  const payload = f.calls.find((c) => c[0] === "queue_sports_reader_job")[1];
  assert.deepEqual(Object.keys(payload.p_payload).sort(), [
    "api_hash",
    "api_id",
    "phone",
  ]);
  assert.equal(payload.p_admin, id);
  assert.ok(!(await result.text()).includes("aaaa"));
  assert.equal(
    (await f.request({ action: "configure", id, api_id: 0, phone: "bad" }))
      .status,
    400,
  );
});
test("post validation rejects malformed dates and cross-message attachment paths", async () => {
  const f = fixture(),
    post = {
      source_id: "-100123",
      message_id: 1,
      content: "fixture",
      posted_at: new Date().toISOString(),
      edited_at: null,
      media: [],
      media_notice: "",
      album_id: null,
      fingerprint: "x",
    };
  assert.equal(
    (await f.request({ action: "post", generation: 1, post }, true)).status,
    200,
  );
  assert.equal(
    (
      await f.request(
        { action: "post", generation: 1, post: { ...post, posted_at: "bad" } },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(
        {
          action: "post",
          generation: 1,
          post: {
            ...post,
            media: [
              {
                path: "-100999/1/" + "a".repeat(64) + ".jpg",
                mime: "image/jpeg",
              },
            ],
          },
        },
        true,
      )
    ).status,
    400,
  );
});
test("uploads check source generation and actual file signature", async () => {
  const f = fixture(),
    base = {
      action: "upload",
      generation: 1,
      source_id: "-100123",
      message_id: 1,
    };
  assert.equal(
    (
      await f.request(
        {
          ...base,
          data: Buffer.from("<script>alert(1)</script>").toString("base64"),
        },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (await f.request({ ...base, generation: 2, data: "/9j/AA==" }, true))
      .status,
    409,
  );
  const r = await f.request({ ...base, data: "/9j/AA==" }, true);
  assert.equal(r.status, 200);
  assert.match((await r.json()).path, /^-100123\/1\/[a-f0-9]{64}\.jpg$/);
});
test("backend errors and malformed bodies never expose credentials", async () => {
  const f = fixture({ dbError: true });
  const r = await f.request({ action: "code", id, code: "12345" });
  assert.equal(r.status, 409);
  assert.ok(!(await r.text()).includes("PRIVATE"));
  assert.equal((await fixture().request(null)).status, 400);
});
