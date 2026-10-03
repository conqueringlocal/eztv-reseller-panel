import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
const load = async (path) => {
  const r = await transform(readFileSync(path, "utf8"), {
    loader: "ts",
    format: "esm",
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(r.code).toString("base64")
  );
};
const { createSupportHandler } = await load(
  "supabase/functions/admin-reseller-session/handler.ts",
);
const actor = "11111111-1111-4111-8111-111111111111",
  target = "22222222-2222-4222-8222-222222222222",
  sid = "33333333-3333-4333-8333-333333333333",
  audit = "44444444-4444-4444-8444-444444444444";
const jwt = (sub = actor, session_id = sid, aal = "aal1") =>
  "header." +
  Buffer.from(JSON.stringify({ sub, session_id, aal })).toString("base64url") +
  ".signature";
function fixture(opts = {}) {
  const calls = [],
    token = jwt(target);
  const db = {
    auth: {
      getUser: async (input) => {
        calls.push(["getUser"]);
        return opts.badAuth
          ? { error: {} }
          : {
              data: {
                user: {
                  id: opts.end ? target : actor,
                  factors: opts.mfa ? [{ status: "verified" }] : [],
                },
              },
            };
      },
      admin: {
        getUserById: async (id) => {
          calls.push(["getUserById", id]);
          return {
            data: {
              user: {
                id,
                email: "canonical@example.invalid",
                email_confirmed_at: opts.unconfirmed ? null : "2026-01-01",
                ...(opts.banned ? { banned_until: "2099-01-01" } : {}),
              },
            },
          };
        },
        generateLink: async (data) => {
          calls.push(["generateLink", data]);
          return opts.linkError
            ? { error: { message: "PRIVATE" } }
            : {
                data: {
                  user: { id: target },
                  properties: { hashed_token: "PRIVATE-HASH" },
                },
              };
        },
        signOut: async (...args) => {
          calls.push(["signOut", ...args]);
          return opts.signOutError ? { error: {} } : { error: null };
        },
      },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "has_role")
        return {
          data: args._user_id === actor ? !opts.reseller : !!opts.adminTarget,
          error: null,
        };
      return opts.claimError ? { error: {} } : { data: audit };
    },
    from: (table) => {
      let update = null;
      const b = {
        select() {
          return b;
        },
        eq() {
          return b;
        },
        update(data) {
          update = data;
          calls.push(["update", data]);
          return b;
        },
        single: async () =>
          table === "profiles"
            ? {
                data: {
                  id: target,
                  name: "Fixture Reseller",
                  role: opts.badProfile ? "admin" : "reseller",
                },
              }
            : opts.auditError
              ? { error: {} }
              : { data: { id: audit } },
        maybeSingle: async () => ({
          data: opts.missingAudit ? null : { id: audit, status: "active" },
        }),
        then(resolve, reject) {
          return Promise.resolve({
            error: opts.endAuditError ? {} : null,
          }).then(resolve, reject);
        },
      };
      return b;
    },
  };
  const sessionClient = () => ({
    auth: {
      verifyOtp: async (data) => {
        calls.push(["verifyOtp", data]);
        return {
          data: {
            session: {
              access_token: token,
              refresh_token: "PRIVATE-REAL-REFRESH",
              user: { id: opts.wrongIdentity ? actor : target },
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
        };
      },
    },
  });
  const handler = createSupportHandler(db, sessionClient);
  return {
    calls,
    async send(
      body = { action: "start", reseller_id: target },
      authorization = jwt(),
      method = "POST",
    ) {
      const r = await handler(
        new Request("https://example.invalid", {
          method,
          headers: authorization
            ? { Authorization: "Bearer " + authorization }
            : {},
          body: method === "POST" ? JSON.stringify(body) : undefined,
        }),
      );
      return {
        status: r.status,
        body: await r.json(),
        cache: r.headers.get("cache-control"),
      };
    },
  };
}
test("anonymous, invalid credentials, resellers and incomplete MFA cannot mint a session", async () => {
  for (const options of [
    { badAuth: true },
    { reseller: true },
    { mfa: true },
  ]) {
    const f = fixture(options);
    assert.ok([401, 403].includes((await f.send()).status));
    assert.ok(!f.calls.some((c) => c[0] === "generateLink"));
  }
  const f = fixture();
  assert.equal((await f.send({}, null)).status, 401);
});
test("only real non-admin reseller identities can be selected", async () => {
  for (const options of [
    { adminTarget: true },
    { badProfile: true },
    { banned: true },
    { unconfirmed: true },
  ]) {
    const f = fixture(options);
    assert.equal((await f.send()).status, 400);
    assert.ok(!f.calls.some((c) => c[0] === "generateLink"));
  }
  assert.equal(
    (await fixture().send({ action: "start", reseller_id: actor })).status,
    400,
  );
  assert.equal(
    (await fixture().send({ action: "start", reseller_id: "bad" })).status,
    400,
  );
});
test("login uses canonical Auth email, validates identity, audits before returning and withholds real refresh token", async () => {
  const f = fixture();
  const r = await f.send({
    action: "start",
    reseller_id: target,
    email: "forged@example.invalid",
    admin_id: target,
  });
  assert.equal(r.status, 200);
  assert.equal(r.cache, "no-store");
  assert.equal(r.body.support.reseller_id, target);
  assert.equal(
    r.body.session.refresh_token,
    "support-session-does-not-refresh",
  );
  assert.ok(!JSON.stringify(r.body).includes("PRIVATE"));
  assert.equal(
    f.calls.find((c) => c[0] === "generateLink")[1].email,
    "canonical@example.invalid",
  );
  assert.equal(
    f.calls.find((c) => c[0] === "claim_admin_reseller_session")[1].p_admin,
    actor,
  );
  assert.ok(
    f.calls.some((c) => c[0] === "update" && c[1].auth_session_id === sid),
  );
});
test("audit/rate failures prevent successful login; failed issuance revokes only the newly issued session", async () => {
  for (const options of [
    { claimError: true },
    { linkError: true },
    { wrongIdentity: true },
    { auditError: true },
  ]) {
    const f = fixture(options);
    const r = await f.send();
    assert.notEqual(r.status, 200);
    assert.ok(!JSON.stringify(r.body).includes("PRIVATE"));
    if (options.wrongIdentity || options.auditError) {
      const exits = f.calls.filter((c) => c[0] === "signOut");
      assert.equal(exits.length, 1);
      assert.equal(exits[0][2], "local");
    }
  }
});
test("ending checks session ownership and never signs out all reseller devices", async () => {
  const f = fixture({ end: true });
  assert.equal((await f.send({ action: "end" }, jwt(target))).status, 200);
  assert.equal(f.calls.find((c) => c[0] === "signOut")[2], "local");
  assert.ok(f.calls.some((c) => c[0] === "update" && c[1].status === "ended"));
  const bad = fixture({ end: true, missingAudit: true });
  assert.equal((await bad.send({ action: "end" }, jwt(target))).status, 403);
  assert.ok(!bad.calls.some((c) => c[0] === "signOut"));
});
test("failed sign-out reports failure; unsupported methods cannot mutate", async () => {
  const f = fixture({ end: true, signOutError: true });
  assert.equal((await f.send({ action: "end" }, jwt(target))).status, 503);
  const x = fixture();
  assert.equal((await x.send({}, null, "GET")).status, 405);
  assert.equal((await x.send({}, null, "OPTIONS")).status, 200);
  assert.equal(x.calls.length, 0);
});
test("support storage never overwrites the normal admin auth key and survives navigation", async () => {
  const { supportStorageKey } = await load("src/lib/supportSession.ts");
  const values = new Map([
    ["sb-hddnqgggjjlildufirof-auth-token", "ADMIN-SENTINEL"],
  ]);
  const storage = {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  assert.equal(supportStorageKey(storage, "/admin", ""), null);
  const key = supportStorageKey(storage, "/support/reseller", "?tab=" + sid);
  assert.equal(key, "eztv-support-" + sid);
  assert.equal(supportStorageKey(storage, "/reseller/customers", ""), key);
  assert.equal(
    values.get("sb-hddnqgggjjlildufirof-auth-token"),
    "ADMIN-SENTINEL",
  );
});
