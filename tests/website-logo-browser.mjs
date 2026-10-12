const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import { renderPage } from "../services/websites/render.mjs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const id = "22222222-2222-4222-8222-222222222222";
const errors = [];
const state = {
  leads: [],
  lead_count: 0,
  activities: [],
  page: null,
  referrals: [],
  rewards: [],
  customers: [],
  credit_unit_price: 3,
  metrics: {
    leads_30d: 0,
    trial_cohort_30d: 0,
    trial_paid_30d: 0,
    sales_30d: 0,
    paid_revenue_30d: 0,
    contact_minutes_30d: 0,
  },
  domain: null,
  website_hosting: {
    enabled: true,
    ipv4: "192.0.2.10",
    management_url: "https://srv1781264.hstgr.cloud/reseller-websites/manage",
  },
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const user = {
    id,
    email: "fixture@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  await context.addInitScript(
    ({ user }) =>
      window === window.top &&
      localStorage.setItem(
        "sb-hddnqgggjjlildufirof-auth-token",
        JSON.stringify({
          access_token: "fixture.jwt.signature",
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user,
        }),
      ),
    { user },
  );
  await context.route(
    "https://hddnqgggjjlildufirof.supabase.co/**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      const args = request.postDataJSON();
      let body = [];
      if (path.includes("/auth/")) body = user;
      else if (path.endsWith("/rpc/is_admin")) body = false;
      else if (path.endsWith("/rpc/get_sales_workspace")) body = state;
      else if (path.endsWith("/rpc/save_sales_page")) {
        state.page = {
          ...args.p_data,
          reseller_id: id,
          revision: (state.page?.revision || 0) + 1,
        };
        body = null;
      } else if (path.endsWith("/rpc/connect_sales_domain")) {
        state.domain = {
          hostname: args.p_hostname,
          verification_token: "a".repeat(64),
          status: "pending",
          message: "Add both DNS records, then check the connection.",
          checked_at: null,
          valid_until: null,
        };
        body = null;
      } else if (path.endsWith("/rpc/disconnect_sales_domain")) {
        state.domain = null;
        state.page.published = false;
        state.page.revision++;
        body = null;
      } else if (path.endsWith("/profiles")) {
        const profile = {
          id,
          name: "Fixture Reseller",
          email: "fixture@example.invalid",
          role: "reseller",
          credits: 20,
          provider: "trex",
          reseller_level: 1,
          credit_purchase_enabled: true,
          parent_reseller_id: null,
        };
        body = request.headers().accept?.includes("vnd.pgrst.object")
          ? profile
          : [profile];
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await context.route(
    "https://srv1781264.hstgr.cloud/reseller-websites/manage",
    async (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST",
            "access-control-allow-headers": "authorization,content-type",
          },
        });
      const { action } = route.request().postDataJSON();
      let body;
      if (action === "verify") {
        Object.assign(state.domain, {
          status: "ready",
          message:
            "Your domain and HTTPS connection are ready. You can publish your page.",
          checked_at: new Date().toISOString(),
          valid_until: new Date(Date.now() + 86400000).toISOString(),
        });
        body = { success: true, message: state.domain.message };
      } else body = { html: renderPage(state.page, true).html };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    process.env.WEBSITE_TEST_URL ||
      "http://127.0.0.1:4191/reseller/sales?tab=page",
  );
  await page.getByRole("heading", { name: "Connect your domain" }).waitFor();
  await page.getByLabel("Business / brand name").fill("Fixture Streaming");
  await page
    .getByLabel("Public customer contact email")
    .fill("hello@example.com");
  assert.equal(
    await page
      .getByRole("button", { name: "Publish on my domain" })
      .isDisabled(),
    true,
  );
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#4f46e5";
    ctx.fillRect(10, 10, 100, 40);
    return canvas.toDataURL("image/png");
  });
  await page
    .getByLabel("Landing page logo (optional)")
    .setInputFiles({
      name: "fixture-logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png.split(",")[1], "base64"),
    });
  await page
    .getByRole("img", { name: "Fixture Streaming logo preview" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("img", { name: "Fixture Streaming logo preview" })
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await page
    .getByLabel("Landing page logo (optional)")
    .setInputFiles({
      name: "not-a-logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await page
    .getByRole("alert")
    .filter({ hasText: "Choose a PNG, JPG or WebP image." })
    .waitFor();
  assert.equal(
    await page
      .getByRole("img", { name: "Fixture Streaming logo preview" })
      .count(),
    1,
  );
  await page
    .getByRole("button", { name: "Save private draft & setup kit" })
    .click();
  await page.getByLabel("Your domain name").waitFor();
  assert.equal(state.page.published, false);
  assert.ok(state.page.logo_data_url.startsWith("data:image/png;base64,"));
  await page.getByLabel("Your domain name").fill("eztvclub.com");
  await page
    .getByRole("button", { name: "Connect domain", exact: true })
    .click();
  await page
    .getByText("Waiting for DNS verification", { exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile domain instructions fit",
  );
  await page.screenshot({
    path: "/tmp/eztv-domains-dns-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await page
    .getByText("Domain connected · HTTPS ready", { exact: true })
    .waitFor();
  assert.equal(state.page.published, false);
  await page
    .getByLabel(
      "I reviewed my logo, brand, description and customer contact email for public display.",
    )
    .check();
  await page
    .getByRole("button", { name: "Publish on my domain", exact: true })
    .click();
  await page.getByText("Your website is published", { exact: true }).waitFor();
  assert.equal(state.page.published, true);
  assert.equal(
    await page
      .getByRole("link", { name: "Visit your published website ↗" })
      .getAttribute("href"),
    "https://eztvclub.com",
  );
  await page.getByRole("button", { name: "Preview saved page" }).click();
  await page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Streaming subscriptions and setup support" })
    .waitFor();
  assert.ok(
    await page
      .frameLocator("iframe")
      .getByRole("img", { name: "Fixture Streaming logo" })
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  assert.equal(
    await page.frameLocator("iframe").getByRole("button").isDisabled(),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/tmp/eztv-domains-desktop.png",
    fullPage: true,
  });
  const publicView = renderPage(state.page, false);
  await context.route("https://eztv-logo-fixture.example/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: publicView.html,
      headers: { "content-security-policy": publicView.csp },
    }),
  );
  const publicPage = await context.newPage();
  await publicPage.goto("https://eztv-logo-fixture.example/");
  assert.ok(
    await publicPage
      .getByRole("img", { name: "Fixture Streaming logo" })
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await publicPage.screenshot({
    path: "/tmp/eztv-logo-public.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Remove logo", exact: true }).click();
  assert.equal(
    await page
      .getByRole("img", { name: "Fixture Streaming logo preview" })
      .count(),
    0,
  );
  await page
    .getByLabel(
      "I reviewed my logo, brand, description and customer contact email for public display.",
    )
    .check();
  await page
    .getByRole("button", { name: "Save & keep published", exact: true })
    .click();
  await page.waitForTimeout(250);
  assert.equal(state.page.logo_data_url, "");
  await page
    .getByRole("button", { name: "Disconnect domain", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disconnect and unpublish", exact: true })
    .click();
  await page.getByLabel("Your domain name").waitFor();
  assert.equal(state.page.published, false);
  assert.equal(state.domain, null);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      logoUpload: true,
      logoInPreview: true,
      logoInPublicPage: true,
      logoRemoval: true,
      invalidFileRejected: true,
      apexDomain: true,
      draft: true,
      dnsInstructions: true,
      domainVerification: true,
      explicitPublishing: true,
      privatePreview: true,
      disconnectUnpublishes: true,
      mobileFits: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
