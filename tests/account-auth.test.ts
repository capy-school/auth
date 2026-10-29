import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db';
import { passkey } from 'better-auth/plugins/passkey';
import { createLocalAuth } from '../src/lib/local-auth';

const origin = 'http://auth.localhost';
let root: string;
let instance: Awaited<ReturnType<typeof createLocalAuth>>;
before(async () => {
  root = await mkdtemp('/tmp/opencode/auth-account-contract-');
  await mkdir(`${root}/.local-auth`);
  instance = await createLocalAuth({ origin, databaseURL: `file:${root}/.local-auth/auth.db`, secret: 'isolated-account-contract-secret-over-32-characters' }, true);
});
after(async () => { try { await instance?.close(); } finally { if (root) await rm(root, { recursive: true, force: true }); } });

async function login(email: string) {
  const sent = await instance.auth.handler(new Request(`${origin}/api/auth/sign-in/magic-link`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, callbackURL: '/dashboard' }) }));
  assert.equal(sent.status, 200);
  const consumed = await instance.auth.handler(new Request(instance.inbox.list()[0].url));
  assert.equal(consumed.status, 302);
  const jar = new Map<string, string>();
  function accept(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const at = pair.indexOf('=');
      const key = pair.slice(0, at); const value = pair.slice(at + 1);
      if (value) jar.set(key, value); else jar.delete(key);
    }
  }
  accept(consumed);
  const headers = () => new Headers({ origin, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), 'content-type': 'application/json' });
  return {
    headers,
    async request(path: string, body?: unknown) {
      const response = await instance.auth.handler(new Request(`${origin}/api/auth${path}`, { method: body === undefined ? 'GET' : 'POST', headers: headers(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
      accept(response); return response;
    },
    async json(path: string, body?: unknown) {
      const response = await this.request(path, body); assert.equal(response.status, 200, path); return response.json();
    },
  };
}

test('real session list/revoke is user-scoped and preserves the current session', async () => {
  const current = await login('sessions@example.invalid');
  const other = await login('sessions@example.invalid');
  const foreign = await login('foreign@example.invalid');
  const own = await instance.auth.api.getSession({ headers: current.headers() });
  const sessions = await current.json('/list-sessions');
  assert.equal(sessions.length, 2);
  const otherSession = sessions.find((session: { id: string }) => session.id !== own!.session.id);
  const foreignSessions = await foreign.json('/list-sessions');
  const forbidden = await current.request('/revoke-session', { token: foreignSessions[0].token });
  assert.equal(forbidden.status, 401);
  await current.json('/revoke-session', { token: otherSession.token });
  assert.equal((await current.json('/list-sessions')).length, 1);
  assert.equal((await instance.auth.api.getSession({ headers: current.headers() }))?.session.id, own!.session.id);
  assert.equal(await instance.auth.api.getSession({ headers: other.headers() }), null);
  assert.equal((await foreign.json('/list-sessions')).length, 1);
});

test('API key create/list/delete uses the controller contract and preserves literal names', async () => {
  const client = await login('keys@example.invalid');
  const name = '<img src=x onerror=alert(1)>';
  const before = Date.now();
  const created = await client.json('/api-key/create', { name, expiresIn: 60 * 60 * 24 * 365 });
  assert.equal(typeof created.key, 'string');
  assert.ok(new Date(created.expiresAt).getTime() >= before + 365 * 24 * 60 * 60 * 1000 - 1000);
  const keys = await client.json('/api-key/list');
  assert.equal(keys[0].name, name);
  assert.equal(keys[0].key, undefined);
  await client.json('/api-key/delete', { keyId: keys[0].id });
  assert.equal((await client.json('/api-key/list')).length, 0);
  const defaultExpiry = await client.json('/api-key/create', { name: 'Default contract only' });
  assert.equal(defaultExpiry.expiresAt, null, 'omitting expiresIn creates a permanent key');
});

test('installed passkey delete returns JSON null after deleting an owned credential', async () => {
  const client = await login('passkey-contract@example.invalid');
  // Enable the existing plugin only on this extra test instance and migrate
  // only the owned temporary database. No hardware-registration claim is made.
  const server = betterAuth({ ...instance.auth.options, plugins: [...instance.auth.options.plugins!, passkey({ rpID: 'auth.localhost', origin })] });
  await (await getMigrations(server.options)).runMigrations();
  const session = await instance.auth.api.getSession({ headers: client.headers() });
  const context = await server.$context;
  const record = await context.adapter.create<{ id: string }>({ model: 'passkey', data: { name: 'Seeded fixture credential', userId: session!.user.id, publicKey: 'unused-delete-contract-key', credentialID: 'unused-delete-contract-id', counter: 0, deviceType: 'singleDevice', backedUp: false, createdAt: new Date() } });
  const deleted = await server.handler(new Request(`${origin}/api/auth/passkey/delete-passkey`, { method: 'POST', headers: client.headers(), body: JSON.stringify({ id: record.id }) }));
  assert.equal(deleted.status, 200);
  assert.equal(await deleted.json(), null);
  const listed = await server.handler(new Request(`${origin}/api/auth/passkey/list-user-passkeys`, { headers: client.headers() }));
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), []);
});

function totp(secret: string, time = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/=/g, '')].map(char => alphabet.indexOf(char.toUpperCase()).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(byte => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  return String((hash.readUInt32BE(hash[hash.length - 1] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
