import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localPolicy, magicLinkDestination } from '../src/lib/local-policy.mjs';

const origin = process.env.AUTH_LOCAL_SMOKE_URL;
test('local HTTP: magic links accept the local origin with existing cookies and reject foreign origins', { skip: !origin }, async () => {
  for (const [requestOrigin, expectedStatus] of [[origin, 200], ['http://evil.localhost', 403]]) {
    const response = await fetch(new URL('/api/auth/sign-in/magic-link', origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: requestOrigin, cookie: 'local-smoke=1' },
      body: JSON.stringify({ email: `origin-${Date.now()}@example.test`, callbackURL: `${origin}/dashboard` }),
    });
    const body = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(body));
    if (expectedStatus === 403) assert.equal(body.code, 'INVALID_ORIGIN');
  }
});

test('local HTTP: inbox magic link → signed session → consumer bridge → OTT completion', { skip: !origin }, async () => {
  const base = new URL(origin);
  assert.ok(base.hostname === 'auth.localhost' && ['http:', 'https:'].includes(base.protocol));
  const target = new URL('/courses?source=auth-smoke', `${base.protocol}//school.localhost${base.port ? `:${base.port}` : ''}`).href;
  const request = (path, init) => fetch(new URL(path, origin), { redirect: 'manual', ...init });
  const loginPage = await request('/');
  assert.equal(loginPage.status, 200);
  const loginHTML = await loginPage.text();
  assert.ok(loginHTML.includes('Open local inbox'));
  assert.ok(loginHTML.includes('Email address'));
  assert.ok(!loginHTML.includes('OAuth Providers'));
  assert.ok(!loginHTML.includes('Sign in with Passkey'));
  const email = `smoke-${Date.now()}@example.test`;
  const callbackURL = magicLinkDestination(target, origin, localPolicy(true, '1', origin));
  const sent = await request('/api/auth/sign-in/magic-link', {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, callbackURL, newUserCallbackURL: callbackURL }),
  });
  assert.equal(sent.status, 200);
  const inbox = await request('/dev/inbox');
  assert.equal(inbox.status, 200);
  assert.equal(inbox.headers.get('cache-control'), 'no-store');
  const html = await inbox.text();
  const entry = [...html.matchAll(/href="([^"]+)"[^>]*>Sign in as ([^<]+)</g)].find(match => match[2] === email);
  assert.ok(entry, 'The new local message is rendered in the inbox');
  const link = entry[1].replaceAll('&amp;', '&');
  const login = await request(link);
  assert.equal(login.status, 302);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('better-auth.session_token='));
  assert.ok(login.headers.getSetCookie().every(value => !/;\s*domain=/i.test(value)));
  const session = await request('/api/session', { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, email);
  const bridge = await request(callbackURL, { headers: { cookie } });
  assert.equal(bridge.status, 302);
  const completion = new URL(bridge.headers.get('location'));
  assert.equal(completion.origin, new URL(target).origin);
  assert.equal(completion.pathname, '/api/local-auth/complete');
  assert.equal(completion.searchParams.get('redirect'), target);
  assert.ok(completion.searchParams.get('token'));
  const exchange = `/api/sso/complete?${completion.searchParams}`;
  const result = await request(exchange);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), target);
  assert.ok(result.headers.getSetCookie().some(value => value.startsWith('better-auth.session_token=')));
  assert.ok(result.headers.getSetCookie().every(value => !/;\s*domain=/i.test(value)));
  assert.equal((await request(exchange)).status, 401);
  const replay = await request(link);
  assert.ok((replay.headers.get('location') ?? '').includes('error='));
  for (const allowed of ['school', 'cms']) {
    const appOrigin = `${base.protocol}//${allowed}.localhost${base.port ? `:${base.port}` : ''}`;
    const cors = await request('/api/session', { method: 'OPTIONS', headers: { origin: appOrigin } });
    assert.equal(cors.headers.get('access-control-allow-origin'), appOrigin);
  }
  for (const denied of ['http://evil.school.localhost', 'https://capyschool.com']) {
    const cors = await request('/api/auth/get-session', { method: 'OPTIONS', headers: { origin: denied } });
    assert.equal(cors.headers.get('access-control-allow-origin'), null);
    const refused = await request(`/api/sso/bridge?${new URLSearchParams({ redirect: denied })}`, { headers: { cookie } });
    assert.equal(new URL(refused.headers.get('location')).origin, origin);
  }
});
