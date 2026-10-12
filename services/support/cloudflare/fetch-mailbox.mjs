// Fetch ciphertext from the fixed Worker and decrypt only on the VPS.
import { constants, privateDecrypt } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

process.umask(0o077);
const local = path.join(process.env.EZTV_SUPPORT_DIR || '/opt/eztv-support-pilot', 'local');
const directory = path.join(local, 'cloudflare');
const statusOnly = process.argv.includes('--status');
if (process.argv.slice(2).some(arg => arg !== '--status')) throw new Error('Only --status is supported; credentials never belong in command arguments.');

async function privateFile(name) {
  const filename = path.join(directory, name);
  if ((await fs.stat(filename)).mode & 0o077) throw new Error(`Permissions too broad on ${name}`);
  return fs.readFile(filename, 'utf8');
}

try {
  const endpoint = new URL(JSON.parse(await privateFile('endpoint.json')).url);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.startsWith('eztv-support-mailbox.') ||
      !endpoint.hostname.endsWith('.workers.dev') || endpoint.pathname !== '/v1/mailbox' ||
      endpoint.search || endpoint.username || endpoint.password || endpoint.port || endpoint.hash) {
    throw new Error('Unexpected handoff endpoint');
  }
  const token = JSON.parse(await privateFile('handoff-token.json')).VPS_HANDOFF_TOKEN;
  const result = await fetch(endpoint, { method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (result.status === 503) {
    const body = await result.json();
    if (body.error === 'mailbox_secret_missing') {
      console.log('Cloudflare connection verified; MAILBUX_APP_PASSWORD has not been added yet.');
      process.exit(statusOnly ? 0 : 2);
    }
  }
  if (!result.ok) throw new Error(`Handoff unavailable (HTTP ${result.status}); no credential saved.`);
  if (statusOnly) {
    await result.body.cancel();
    console.log('Cloudflare mailbox secret is ready. No local credential changed.');
    process.exit(0);
  }
  if (result.headers.get('cache-control') !== 'no-store, max-age=0') throw new Error('Unexpected cache policy');
  const body = await result.json();
  if (body.version !== 1 || body.algorithm !== 'RSA-OAEP-256' || body.mailbox !== 'support@eztvclub.com' ||
      typeof body.ciphertext !== 'string' || !/^[A-Za-z0-9+/]{512}$/.test(body.ciphertext)) throw new Error('Invalid encrypted response');
  const password = privateDecrypt({ key: await privateFile('vps-private.pem'), padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256' }, Buffer.from(body.ciphertext, 'base64')).toString('utf8');
  if (!password || Buffer.byteLength(password) > 256 || /[\r\n\0]/.test(password)) throw new Error('Invalid mailbox credential');
  const target = path.join(local, 'mailbux.json');
  const content = { email: 'support@eztvclub.com', app_password: password, imap_host: 'my.mailbux.com', imap_port: 993,
    smtp_host: 'my.mailbux.com', smtp_port: 587, smtp_starttls: true, folder: 'EZTV-Support-Pilot',
    keep_on_server: true, activate_channel: false };
  await fs.writeFile(target, JSON.stringify(content, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log('Mailbox app password saved privately on the VPS. No email fetched or sent. Close the Cloudflare handoff after verifying access.');
} catch {
  // Exceptions can include request details; never print them or credential values.
  console.error('Secure handoff did not complete. Check endpoint, access, expiry and whether a credential file already exists. No credential was printed.');
  process.exitCode = 1;
}
