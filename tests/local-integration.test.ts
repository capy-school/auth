import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAuth, validateLocalDatabase } from '../src/lib/local-auth';

test('local database rejects remote URLs and existing legacy local.db', () => {
  for (const url of ['libsql://production.test', 'file:local.db', 'file:/tmp/local.db', 'file:/tmp/.local-auth/../local.db']) {
    assert.throws(() => validateLocalDatabase(url));
  }
});

test('real isolated magic link signs in once, emits host-only signed session, and OTT is single-use', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auth-test-'));
  await mkdir(join(root, '.local-auth'));
  let instance;
  try {
    instance = await createLocalAuth({
      origin: 'http://auth.localhost',
      databaseURL: `file:${root}/.local-auth/auth.db`,
      secret: 'isolated-test-secret-with-at-least-32-characters',
    }, true);
    const { auth, inbox } = instance;
    const sent = await auth.handler(new Request('http://auth.localhost/api/auth/sign-in/magic-link', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://auth.localhost' },
      body: JSON.stringify({ email: 'learner@example.test', callbackURL: '/dashboard' }),
    }));
    assert.equal(sent.status, 200);
    assert.equal(inbox.list().length, 1);
    const link = inbox.list()[0].url;
    const consumed = await auth.handler(new Request(link));
    assert.equal(consumed.status, 302);
    assert.equal(new URL(consumed.headers.get('location')!, 'http://auth.localhost').pathname, '/dashboard');
    const cookies = consumed.headers.getSetCookie();
    assert.ok(cookies.some(cookie => cookie.startsWith('better-auth.session_token=')));
    assert.ok(cookies.every(cookie => !/;\s*domain=/i.test(cookie)));
    const headers = new Headers({ cookie: cookies.map(cookie => cookie.split(';')[0]).join('; ') });
    const session = await auth.api.getSession({ headers });
    assert.equal(session?.user.email, 'learner@example.test');
    const replay = await auth.handler(new Request(link));
    assert.match(replay.headers.get('location') ?? '', /error=/);
    assert.ok(!replay.headers.getSetCookie().some(cookie => cookie.startsWith('better-auth.session_token=')));
    const { token } = await auth.api.generateOneTimeToken({ headers });
    const verified = await auth.api.verifyOneTimeToken({ body: { token } });
    assert.equal(verified.user.id, session?.user.id);
    await assert.rejects(() => auth.api.verifyOneTimeToken({ body: { token } }));
  } finally {
    await instance?.close();
    await rm(root, { recursive: true, force: true });
  }
});
