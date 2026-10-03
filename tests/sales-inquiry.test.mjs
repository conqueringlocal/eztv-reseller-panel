import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
const code = await transform(
  readFileSync("supabase/functions/public-sales-inquiry/handler.ts", "utf8"),
  { loader: "ts", format: "esm" },
);
const { createInquiryHandler, validInquiry } = await import(
  "data:text/javascript;base64," + Buffer.from(code.code).toString("base64")
);
const body = {
  id: crypto.randomUUID(),
  slug: "test-brand",
  name: "Test Person",
  email: "test@example.invalid",
  phone: "",
  device: "",
  message: "",
  contact_consent: true,
  marketing_consent: false,
};
function fixture(result = { data: "received", error: null }) {
  const calls = [];
  const h = createInquiryHandler(
    {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return result;
      },
    },
    "test-only-secret",
  );
  return {
    calls,
    async send(data = body, method = "POST") {
      const response = await h(
        new Request("https://example.invalid", {
          method,
          headers: { "x-forwarded-for": "forged, 192.0.2.1" },
          body: method === "POST" ? JSON.stringify(data) : undefined,
        }),
      );
      return { status: response.status, body: await response.json() };
    },
  };
}
test("validates inputs, request consent and payload size before database access", async () => {
  const f = fixture();
  for (const change of [
    { contact_consent: false },
    { marketing_consent: "yes" },
    { id: "not-uuid" },
    { email: "bad" },
    { slug: "../bad" },
    { name: "A" },
  ]) {
    assert.equal(validInquiry({ ...body, ...change }), false);
    assert.equal((await f.send({ ...body, ...change })).status, 400);
  }
  assert.equal(
    (await f.send({ ...body, message: "x".repeat(11000) })).status,
    413,
  );
  assert.equal(f.calls.length, 0);
});
test("honeypot and unsupported methods cannot create a lead", async () => {
  const f = fixture();
  assert.equal((await f.send({ ...body, website: "bot" })).status, 200);
  assert.equal((await f.send(body, "GET")).status, 405);
  assert.equal((await f.send(body, "OPTIONS")).status, 200);
  assert.equal(f.calls.length, 0);
});
test("only allowed fields reach the service RPC and raw IP or identities never return", async () => {
  const f = fixture();
  const response = await f.send({
    ...body,
    reseller_id: "forged",
    paid_amount: 999,
    stage: "paid",
  });
  assert.deepEqual(response.body, { success: true });
  assert.equal(f.calls.length, 1);
  const { args, name } = f.calls[0];
  assert.equal(name, "submit_public_sales_inquiry");
  assert.match(args.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(args).includes("192.0.2.1"));
  assert.equal(args.p_data.reseller_id, undefined);
  assert.equal(args.p_data.stage, undefined);
});
test("database errors, rate limits and unknown outcomes do not report success or leak details", async () => {
  for (const [result, status] of [
    [{ error: { message: "PRIVATE SECRET" } }, 503],
    [{ data: "rate_limited" }, 429],
    [{ data: null, error: null }, 503],
  ]) {
    const f = fixture(result);
    const r = await f.send();
    assert.equal(r.status, status);
    assert.ok(!JSON.stringify(r).includes("PRIVATE"));
    assert.notEqual(r.body.success, true);
  }
});
