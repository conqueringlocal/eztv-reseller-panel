// Creates local transport credentials and a Worker config, never a mailbox password.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.umask(0o077);
const directory = path.join(process.env.EZTV_SUPPORT_DIR || '/opt/eztv-support-pilot', 'local/cloudflare');
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
await fs.chmod(directory, 0o700);
const keyFile = path.join(directory, 'vps-private.pem');
let publicKey;
try {
  await fs.access(keyFile);
  const { createPublicKey } = await import('node:crypto');
  publicKey = createPublicKey(await fs.readFile(keyFile)).export({ format: 'der', type: 'spki' }).toString('base64');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  await fs.writeFile(keyFile, pair.privateKey, { mode: 0o600, flag: 'wx' });
  publicKey = pair.publicKey.toString('base64');
}
const tokenFile = path.join(directory, 'handoff-token.json');
try { await fs.access(tokenFile); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await fs.writeFile(tokenFile, JSON.stringify({ VPS_HANDOFF_TOKEN: randomBytes(48).toString('base64url') }), { mode: 0o600, flag: 'wx' });
}
const configFile = path.join(directory, 'wrangler.json');
try {
  await fs.access(configFile);
  console.log('Existing handoff configuration retained; expiry was not extended.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const config = {
    name: 'eztv-support-mailbox',
    account_id: '7dab44ab414c0018bf0ef6dfce235b56',
    main: path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker.mjs'),
    compatibility_date: '2026-10-09',
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: false },
    vars: { HANDOFF_ENABLED: 'true', HANDOFF_EXPIRES_AT: new Date(Date.now() + 7 * 86400000).toISOString(), VPS_PUBLIC_KEY_SPKI: publicKey },
  };
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' });
}
console.log('Cloudflare handoff files prepared privately. No mailbox credential entered or printed.');
