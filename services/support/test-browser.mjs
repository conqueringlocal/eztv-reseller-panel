// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium, devices } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root = process.env.EZTV_SUPPORT_DIR || '/opt/eztv-support-pilot';
const credentials = JSON.parse(await fs.readFile(path.join(root, 'local/pilot-users.json'), 'utf8'));
const report = JSON.parse(await fs.readFile(path.join(root, 'local/pilot-test-result.json'), 'utf8'));
const output = process.env.EZTV_SUPPORT_SCREENSHOTS || '/mnt/data';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const [who, viewport, label] of [
    ['agent', { width: 1440, height: 1000 }, 'agent-desktop'],
    ['reseller-a', { width: 1440, height: 1000 }, 'reseller-desktop'],
    ['reseller-a', { width: 390, height: 844 }, 'reseller-mobile'],
    ['agent', { width: 390, height: 844 }, 'agent-mobile'],
  ]) {
    const mobile = label.endsWith('-mobile');
    const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport });
    const page = await context.newPage();
    await page.goto(`http://localhost:8093${mobile ? '/mobile' : ''}`);
    await page.locator(mobile ? 'input[name=login]' : 'input[name=username]').fill(credentials[who].email);
    await page.locator('input[name=password]').fill(credentials[who].password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('input[name=password]').waitFor({ state: 'hidden' });
    await page.goto(`http://localhost:8093/${mobile ? 'mobile/tickets/' : '#ticket/zoom/'}${report.tickets['reseller-a']}`);
    await page.getByText('PILOT public reply', { exact: false }).first().waitFor();
    const body = await page.locator('body').innerText();
    assert.ok(body.includes('PILOT public reply'), `${label}: public conversation missing`);
    assert.equal(body.includes('PILOT INTERNAL ONLY'), who === 'agent', `${label}: wrong internal note visibility`);
    assert.ok(!body.includes(credentials[who].password), `${label}: password visible`);
    if (mobile) {
      const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(width.document <= width.viewport + 1, `${label}: horizontal overflow`);
      assert.ok(page.url().includes('/mobile/tickets/'), `${label}: dedicated mobile UI not used`);
    }
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, `eztv-support-${label}.png`), fullPage: true });
    results.push(`${label}: login, ticket rendering and note visibility passed`);
    console.log(`PASS ${results.at(-1)}`);
    await context.close();
  }
  await fs.writeFile(path.join(root, 'local/browser-test-result.json'), JSON.stringify({ tested_at: new Date().toISOString(), passed: results }, null, 2));
} finally {
  await browser.close();
}
