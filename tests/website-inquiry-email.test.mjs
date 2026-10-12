import { test, before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
let handler, message;
before(async () => {
  const r = await build({
    entryPoints: ["supabase/functions/sales-inquiry-email/handler.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  ({ inquiryEmailHandler: handler, inquiryMessage: message } = await import(
    "data:text/javascript;base64," +
      Buffer.from(r.outputFiles[0].text).toString("base64")
  ));
});
const job = {
  id: "11111111-1111-4111-8111-111111111111",
  lead_id: "22222222-2222-4222-8222-222222222222",
  claim_id: "33333333-3333-4333-8333-333333333333",
  recipient: "owner@example.invalid",
  inquiry: {
    name: "Prospect <script>",
    email: "prospect@example.invalid",
    phone: "123",
    device: "TV",
    message: "Can you help?",
  },
};
const request = (token = "good", action = "work") =>
  new Request("https://worker.invalid", {
    method: "POST",
    headers: { "X-Inquiry-Email-Token": token },
    body: JSON.stringify({ action }),
  });
function setup({
  verify = async () => {},
  send = async () => {},
  configured = true,
  finishFails = false,
} = {}) {
  let claimed = false,
    sent = 0;
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "authorize_sales_inquiry_email_worker")
        return { data: args.p_token === "good" };
      if (name === "claim_sales_inquiry_email") {
        const data = claimed ? null : job;
        claimed = true;
        return { data };
      }
      if (name === "finish_sales_inquiry_email") return { data: !finishFails };
      throw Error("unexpected_rpc");
    },
  };
  return {
    run: handler(db, {
      configured,
      verify,
      send: async (m) => {
        sent++;
        await send(m);
      },
    }),
    calls,
    count: () => sent,
  };
}
test("message contains inquiry, correct CRM deep link and direct reply address without html execution", () => {
  const m = message(job);
  assert.equal(m.to, job.recipient);
  assert.equal(m.replyTo, job.inquiry.email);
  assert.match(m.text, /Can you help/);
  assert.match(m.text, /tab=leads&lead=222/);
  assert.equal(m.html, undefined);
  assert.match(m.messageId, /website-inquiry/);
  assert.throws(() =>
    message({ ...job, recipient: "x@example.com\r\nBcc:bad@example.com" }),
  );
});
test("worker denies callers without its dedicated token and does not claim jobs", async () => {
  const s = setup();
  assert.equal((await s.run(request("wrong"))).status, 401);
  assert.equal(s.calls.length, 1);
  assert.equal(s.count(), 0);
});
test("successful SMTP submission saves acceptance only after transport succeeds", async () => {
  const s = setup();
  assert.equal((await s.run(request())).status, 200);
  assert.equal(s.count(), 1);
  assert.equal(
    s.calls.find((c) => c[0] === "finish_sales_inquiry_email")[1].p_status,
    "sent",
  );
});
test("health verifies SMTP without claiming or sending", async () => {
  const s = setup();
  const r = await s.run(request("good", "health"));
  assert.equal((await r.json()).smtp_verified, true);
  assert.equal(s.count(), 0);
  assert.equal(s.calls.length, 1);
});
test("pre-send outage schedules safe retry; lost SMTP response records uncertain outcome", async () => {
  for (const [options, status, sent] of [
    [
      {
        verify: async () => {
          throw Error("connect");
        },
      },
      "retry",
      0,
    ],
    [
      {
        send: async () => {
          throw Error("lost response");
        },
      },
      "uncertain",
      1,
    ],
    [
      {
        send: async () => {
          throw Object.assign(Error("temporary"), { responseCode: 451 });
        },
      },
      "retry",
      1,
    ],
    [
      {
        send: async () => {
          throw Object.assign(Error("rejected"), { responseCode: 550 });
        },
      },
      "failed",
      1,
    ],
  ]) {
    const s = setup(options);
    await s.run(request());
    assert.equal(s.count(), sent);
    assert.equal(
      s.calls.find((c) => c[0] === "finish_sales_inquiry_email")[1].p_status,
      status,
    );
  }
});
test("a lost database acknowledgement stops the batch without resending", async () => {
  const s = setup({ finishFails: true });
  assert.equal((await s.run(request())).status, 503);
  assert.equal(s.count(), 1);
  assert.equal(
    s.calls.filter((c) => c[0] === "claim_sales_inquiry_email").length,
    1,
  );
});
