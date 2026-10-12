import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import worker from './worker.mjs';

const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const token = 'synthetic-handoff-token-'.repeat(3);
const env = {
  VPS_HANDOFF_TOKEN: token,
  MAILBUX_APP_PASSWORD: 'SYNTHETIC-MAILBOX-CREDENTIAL',
  HANDOFF_ENABLED: 'true',
  HANDOFF_EXPIRES_AT: new Date(Date.now() + 86400000).toISOString(),
  VPS_PUBLIC_KEY_SPKI: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
};
const request = (options = {}) => new Request('https://eztv-support-mailbox.test.workers.dev/v1/mailbox', {
  method: 'POST', headers: { Authorization: `Bearer ${token}` }, ...options,
});

test('Reject anonymous and incorrect credentials', async () => {
  for (const headers of [{}, { Authorization: 'Bearer invalid' }]) {
    const response = await worker.fetch(request({ headers }), env);
    assert.equal(response.status, 401);
    assert.ok(!(await response.text()).includes(env.MAILBUX_APP_PASSWORD));
  }
});
test('Fail closed without transport secret', async () => {
  assert.equal((await worker.fetch(request(), { ...env, VPS_HANDOFF_TOKEN: undefined })).status, 401);
});
test('Reject browser-origin requests and preflight', async () => {
  assert.equal((await worker.fetch(request({ headers: { Authorization: `Bearer ${token}`, Origin: 'https://reseller.eztvclub.com' } }), env)).status, 403);
  assert.equal((await worker.fetch(request({ method: 'OPTIONS' }), env)).status, 405);
});
test('Reject GET, unencrypted transport, other routes and query parameters', async () => {
  assert.equal((await worker.fetch(request({ method: 'GET' }), env)).status, 405);
  for (const url of ['http://example.com/v1/mailbox', 'https://example.com/other', 'https://example.com/v1/mailbox?secret=another']) {
    assert.equal((await worker.fetch(new Request(url, { method: 'POST' }), env)).status, 404);
  }
});
test('Disabled, expired and invalid expiry all close the handoff', async () => {
  for (const changes of [{ HANDOFF_ENABLED: 'false' }, { HANDOFF_EXPIRES_AT: '2000-01-01' }, { HANDOFF_EXPIRES_AT: 'invalid' }]) {
    assert.equal((await worker.fetch(request(), { ...env, ...changes })).status, 410);
  }
});
test('Missing mailbox secret is distinguishable only after authentication', async () => {
  const response = await worker.fetch(request(), { ...env, MAILBUX_APP_PASSWORD: undefined });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'mailbox_secret_missing' });
});
test('Invalid mailbox values fail without echoing their contents', async () => {
  for (const value of ['a'.repeat(257), 'synthetic\nvalue', 'synthetic\0value']) {
    const response = await worker.fetch(request(), { ...env, MAILBUX_APP_PASSWORD: value });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: 'invalid_mailbox_secret' });
  }
});
test('Malformed destination key fails without returning secret', async () => {
  const response = await worker.fetch(request(), { ...env, VPS_PUBLIC_KEY_SPKI: 'bad' });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(env.MAILBUX_APP_PASSWORD));
});
test('Authenticated response is encrypted solely for the pinned VPS key', async () => {
  const response = await worker.fetch(request({ body: JSON.stringify({ publicKey: 'attacker-chosen-key' }) }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const text = await response.text();
  assert.ok(!text.includes(env.MAILBUX_APP_PASSWORD));
  const body = JSON.parse(text);
  assert.equal(body.mailbox, 'support@eztvclub.com');
  assert.equal(body.algorithm, 'RSA-OAEP-256');
  assert.equal(body.ciphertext.length, 512);
  const clear = privateDecrypt({ key: pair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(body.ciphertext, 'base64'));
  assert.equal(clear.toString(), env.MAILBUX_APP_PASSWORD);
});
test('Encryption is randomized for repeated authorized requests', async () => {
  const a = await (await worker.fetch(request(), env)).json();
  const b = await (await worker.fetch(request(), env)).json();
  assert.notEqual(a.ciphertext, b.ciphertext);
});
