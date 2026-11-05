import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { kitStaticFixture } from './helpers/kit-static-fixture.mjs';

test('production document declares the language of the approved Spanish UI', async () => {
  const template = await readFile(new URL('../src/kit/app.html', import.meta.url), 'utf8');
  assert.match(template, /<html lang="es">/);
});

test('file-host fixture serves static bytes and real isolated magic-link sessions', async () => {
  const directory = await mkdtemp('/tmp/opencode/auth-kit-fixture-test-');
  await writeFile(`${directory}/index.html`, '<!doctype html><title>Generic static shell</title>');
  let fixture;
  try {
    fixture = await kitStaticFixture({ directory });
    const shell = await fixture.request('/');
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /Generic static shell/);
    assert.equal(shell.headers.get('set-cookie'), null);
    assert.equal((await fixture.request('/unknown')).status, 404);
    assert.equal((await fixture.request('/api/session')).status, 401);
    const sentEvent = fixture.waitForResponse('/api/auth/sign-in/magic-link');
    const sent = await fixture.request('/api/auth/sign-in/magic-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fixture@example.invalid', callbackURL: fixture.origin + '/dashboard/' }),
    });
    assert.equal(sent.status, 200, await sent.text());
    assert.equal((await sentEvent).status, 200);
    const [message] = fixture.inbox.list();
    assert.equal(message.email, 'fixture@example.invalid');
    const verified = await fixture.request(message.url, { redirect: 'manual' });
    assert.equal(verified.status, 302);
    const cookies = verified.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok(cookies);
    const session = await fixture.request('/api/session', { headers: { Cookie: cookies } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.email, 'fixture@example.invalid');
    fixture.overrideSession(503);
    assert.equal((await fixture.request('/api/session', { headers: { Cookie: cookies } })).status, 503);
    fixture.overrideSession(null);
    assert.equal((await fixture.request('/api/session', { headers: { Cookie: cookies } })).status, 200);
    assert.ok(fixture.requests.some(request => request.method === 'POST' && request.path === '/api/auth/sign-in/magic-link'));
  } finally {
    await fixture?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
