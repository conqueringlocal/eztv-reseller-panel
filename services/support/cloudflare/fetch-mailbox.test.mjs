import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Worker-to-client handoff saves valid private JSON, handles status and refuses overwrite', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eztv-mailbox-test-'));
  try {
    const directory = path.join(root, 'local/cloudflare');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
    const token = 'synthetic-token-'.repeat(5);
    const password = 'synthetic-rn0-password';
    const write = (name, contents) => fs.writeFile(path.join(directory, name), contents, { mode: 0o600 });
    await write('vps-private.pem', pair.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    await write('handoff-token.json', JSON.stringify({ VPS_HANDOFF_TOKEN: token }));
    await write('endpoint.json', JSON.stringify({ url: 'https://eztv-support-mailbox.test.workers.dev/v1/mailbox' }));
    const env = { VPS_HANDOFF_TOKEN: token, MAILBUX_APP_PASSWORD: password, HANDOFF_ENABLED: 'true',
      HANDOFF_EXPIRES_AT: new Date(Date.now() + 86400000).toISOString(),
      VPS_PUBLIC_KEY_SPKI: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
    const mock = path.join(root, 'mock.mjs');
    await fs.writeFile(mock, `import worker from ${JSON.stringify(new URL('./worker.mjs', import.meta.url).href)};
      globalThis.fetch = (url, options) => worker.fetch(new Request(url, options), ${JSON.stringify(env)});`, { mode: 0o600 });
    const run = (...args) => spawnSync(process.execPath, ['--import', mock, fileURLToPath(new URL('./fetch-mailbox.mjs', import.meta.url)), ...args],
      { encoding: 'utf8', env: { ...process.env, EZTV_SUPPORT_DIR: root } });
    const target = path.join(root, 'local/mailbux.json');
    const status = run('--status');
    assert.equal(status.status, 0);
    await assert.rejects(fs.access(target), { code: 'ENOENT' });
    const result = run();
    assert.equal(result.status, 0);
    assert.ok(!(result.stdout + result.stderr).includes(password));
    assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
    const saved = await fs.readFile(target, 'utf8');
    assert.equal(JSON.parse(saved).app_password, password);
    assert.equal(JSON.parse(saved).activate_channel, false);
    const second = run();
    assert.equal(second.status, 1);
    assert.equal(await fs.readFile(target, 'utf8'), saved);
    assert.ok(!(second.stdout + second.stderr).includes(password));
    await fs.chmod(path.join(directory, 'handoff-token.json'), 0o644);
    assert.equal(run('--status').status, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
