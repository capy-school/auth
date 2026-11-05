import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readSession } from '../src/kit/lib/auth/session';
import { createLoginPolicy, validateLoginQuery, continuationTarget, rememberLogin, safeStorage } from '../src/kit/lib/auth/policy';
import { signInOAuth, signInMagicLink, signInPasskey } from '../src/kit/lib/auth/login';

const registry = {
  capyschool: { id: 'capyschool', name: 'CapySchool', description: 'School', validBases: ['https://capyschool.com', 'https://capy.town'] },
  'cms-ai': { id: 'cms-ai', name: 'CMS-AI', description: 'CMS', validBases: ['https://cms.capy.town'] },
} as const;
const policy = createLoginPolicy(registry, false, undefined, 'https://auth.example.test');
const request = (respond: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => respond as typeof fetch;

test('401 is anonymous and session requests are credentialed, uncached and cancellable', async () => {
  const calls: Array<[unknown, RequestInit | undefined]> = [];
  const controller = new AbortController();
  const state = await readSession(request(async (url, init) => {
    calls.push([url, init]);
    return new Response(null, { status: 401 });
  }), controller.signal);
  assert.deepEqual(state, { state: 'anonymous' });
  assert.equal(calls[0][0], '/api/session');
  assert.equal(calls[0][1]?.credentials, 'include');
  assert.equal(calls[0][1]?.cache, 'no-store');
  assert.equal(calls[0][1]?.signal, controller.signal);
});

test('only a real user with a nonempty id and safe basic types authenticates', async () => {
  const user = { id: 'user-1', name: '<name>', email: 'user@example.test', image: null, emailVerified: true, twoFactorEnabled: false, role: 'member' };
  const state = await readSession(request(async () => Response.json({ user: { ...user, token: 'never-copy' }, session: { token: 'never-copy' } })));
  assert.deepEqual(state, { state: 'authenticated', user });
  for (const invalid of [null, {}, { id: '' }, { id: '  ' }, { id: 7 }, { id: 'x', email: null }, { id: 'x', name: {} }, { id: 'x', image: [] }, { id: 'x', emailVerified: 'true' }, { id: 'x', role: 1 }, { id: 'x', twoFactorEnabled: 1 }]) {
    await assert.rejects(() => readSession(request(async () => Response.json({ user: invalid }))), /session/i);
  }
  assert.deepEqual(await readSession(request(async () => Response.json({ user: { id: 'minimal' } }))), { state: 'authenticated', user: { id: 'minimal' } });
});

test('HTTP failures, malformed JSON and network failures are errors, never logout or invented sessions', async () => {
  for (const status of [400, 403, 404, 429, 500, 503]) {
    await assert.rejects(() => readSession(request(async () => new Response(null, { status }))), /session/i);
  }
  for (const body of ['not JSON', 'null', '{}', '{"user":{}}']) {
    await assert.rejects(() => readSession(request(async () => new Response(body))), /session/i);
  }
  const offline = new Error('offline');
  await assert.rejects(() => readSession(request(async () => { throw offline; })), error => error === offline);
});

test('query validation fails closed for incomplete, unknown, ambiguous and unsafe destinations', () => {
  assert.deepEqual(validateLoginQuery('', policy).errors, []);
  for (const query of ['?app=capyschool', '?redirect=https://capyschool.com/', '?app=&redirect=', '?app=unknown&redirect=https://capyschool.com/', '?app=constructor&redirect=https://capyschool.com/', '?app=capyschool&redirect=not-a-url', '?app=capyschool&redirect=https://foreign.test/', '?app=capyschool&redirect=https://me:secret@capyschool.com/', '?app=capyschool&app=cms-ai&redirect=https://capyschool.com/', '?app=capyschool&redirect=javascript:alert(1)']) {
    const validated = validateLoginQuery(query, policy);
    assert.ok(validated.errors.length, query);
    assert.equal(continuationTarget(query, undefined, policy), null, query);
  }
  const valid = validateLoginQuery('?app=CAPYSCHOOL&redirect=https://capyschool.com/lessons?x=1', policy);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.app?.id, 'capyschool');
  assert.equal(valid.target, 'https://capyschool.com/lessons?x=1');
});

test('local mode requires development, explicit Kit opt-in and the actual exact auth.localhost origin', () => {
  for (const [dev, flag] of [[false, '1'], [true, undefined], [true, '0']] as const) {
    assert.equal(createLoginPolicy(registry, dev, flag, 'http://auth.localhost').local, null);
  }
  for (const origin of ['http://localhost', 'http://auth.localhost.evil.test', 'ftp://auth.localhost', 'http://me@auth.localhost', 'http://auth.localhost/path', 'http://auth.localhost/?x=1']) {
    assert.throws(() => createLoginPolicy(registry, true, '1', origin), /local|origin/i, origin);
  }
  const local = createLoginPolicy(registry, true, '1', 'http://auth.localhost:1355');
  assert.equal(local.local?.authOrigin, 'http://auth.localhost:1355');
  assert.deepEqual(validateLoginQuery('?app=capyschool&redirect=http://school.localhost:1355/lesson', local).errors, []);
  assert.ok(validateLoginQuery('?app=capyschool&redirect=https://capyschool.com/', local).errors.length);
  assert.deepEqual(registry.capyschool.validBases, ['https://capyschool.com', 'https://capy.town'], 'local policy must not mutate shared registry');
});

test('optional storage is failure-safe, stores only validated continuation and never masks bad query with stale storage', () => {
  const writes: Array<[string, string]> = [];
  const storage = safeStorage(() => ({ getItem: key => ({ 'app.id': 'capyschool', 'app.redirect': 'https://capyschool.com/return' })[key] ?? null, setItem: (key, value) => { writes.push([key, value]); } }));
  rememberLogin(validateLoginQuery('?app=capyschool&redirect=https://capyschool.com/lesson', policy), storage);
  assert.deepEqual(writes, [['app.id', 'capyschool'], ['app.redirect', 'https://capyschool.com/lesson']]);
  rememberLogin(validateLoginQuery('?app=capyschool&redirect=https://evil.test', policy), storage);
  assert.equal(writes.length, 2);
  assert.equal(continuationTarget('', storage, policy), 'https://capyschool.com/return');
  assert.equal(continuationTarget('?app=invalid', storage, policy), null);
  const blocked = safeStorage(() => { throw new Error('blocked'); });
  assert.equal(blocked.getItem('app.id'), null);
  assert.doesNotThrow(() => blocked.setItem('app.id', 'capyschool'));
  assert.equal(continuationTarget('', blocked, policy), '/dashboard');
});

test('OAuth uses native versus generic IDs, real callback payloads and reports returned errors', async () => {
  const calls: Array<[string, unknown]> = [];
  const client = { signIn: {
    social: async (payload: unknown) => { calls.push(['social', payload]); return { data: {} }; },
    oauth2: async (payload: unknown) => { calls.push(['oauth2', payload]); return { data: {} }; },
  } };
  for (const provider of ['google', 'github', 'microsoft', 'kakao', 'naver', 'line']) await signInOAuth(client, provider, '/dashboard', policy);
  await signInOAuth(client, 'custom-oidc', 'https://capyschool.com/lesson', policy);
  assert.deepEqual(calls[0], ['social', { provider: 'google', callbackURL: '/dashboard', newUserCallbackURL: '/dashboard', errorCallbackURL: '/dashboard' }]);
  assert.ok(calls.slice(0, 6).every(([kind]) => kind === 'social'));
  assert.deepEqual(calls[6], ['oauth2', { providerId: 'custom-oidc', callbackURL: '/api/sso/bridge?redirect=https%3A%2F%2Fcapyschool.com%2Flesson', newUserCallbackURL: '/api/sso/bridge?redirect=https%3A%2F%2Fcapyschool.com%2Flesson', errorCallbackURL: '/api/sso/bridge?redirect=https%3A%2F%2Fcapyschool.com%2Flesson' }]);
  await assert.rejects(() => signInOAuth({ signIn: { social: async () => ({ error: { message: 'Provider unavailable' } }) } }, 'google', '/dashboard', policy), /Provider unavailable/);
  const local = createLoginPolicy(registry, true, '1', 'http://auth.localhost');
  await assert.rejects(() => signInOAuth(client, 'google', '/dashboard', local), /local/i);
  assert.equal(calls.length, 7);
});

test('magic link preserves the Better Auth nested local callback workaround without persisting email', async () => {
  const calls: unknown[] = [];
  const client = { signIn: { magicLink: async (payload: unknown) => { calls.push(payload); return { data: {} }; } } };
  await signInMagicLink(client, 'person@example.test', '/dashboard', policy);
  const local = createLoginPolicy(registry, true, '1', 'http://auth.localhost');
  await signInMagicLink(client, 'person@example.test', 'http://school.localhost/lesson?x=1', local);
  assert.deepEqual(calls[0], { email: 'person@example.test', callbackURL: '/dashboard', newUserCallbackURL: '/dashboard', errorCallbackURL: '/dashboard' });
  const callback = 'http://auth.localhost/api/sso/bridge?redirect=http%3A%2F%2Fschool.localhost%2Flesson%3Fx%3D1';
  assert.deepEqual(calls[1], { email: 'person@example.test', callbackURL: callback, newUserCallbackURL: callback, errorCallbackURL: callback });
  await assert.rejects(() => signInMagicLink(client, '', '/dashboard', policy), /email/i);
});

test('passkey supports explicit and conditional autofill with one safe destination and no local requests', async () => {
  const payloads: any[] = [];
  const destinations: string[] = [];
  const client = { signIn: { passkey: async (payload: any) => { payloads.push(payload); payload.fetchOptions.onSuccess(); return { data: {} }; } } };
  await signInPasskey(client, '/dashboard', policy, destination => { destinations.push(destination); });
  await signInPasskey(client, 'https://capy.town/lesson', policy, destination => { destinations.push(destination); }, true);
  assert.equal(payloads[0].autoFill, false);
  assert.equal(payloads[1].autoFill, true);
  assert.deepEqual(destinations, ['/dashboard', 'https://capy.town/lesson']);
  const local = createLoginPolicy(registry, true, '1', 'http://auth.localhost');
  await assert.rejects(() => signInPasskey(client, '/dashboard', local, () => {}), /local/i);
  assert.equal(payloads.length, 2);
});

test('shared Better Auth client uses every browser origin without compiled backend or import-time requests', () => {
  const source = readFileSync(new URL('../src/lib/auth-client.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /PUBLIC_AUTH_URL|capyschool\.com|capy\.town|localhost:4321|fetch\s*\(/);
  assert.match(source, /window\.location\.origin/);
  for (const plugin of ['genericOAuthClient', 'twoFactorClient', 'magicLinkClient', 'oneTimeTokenClient', 'passkeyClient', 'apiKeyClient', 'organizationClient']) assert.match(source, new RegExp(`${plugin}\\(\\)`));
});

test('real Better Auth SDK sends credentialed magic-link POSTs to arbitrary browser origins, never at import', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalFetch = globalThis.fetch;
  let importRequests = 0;
  globalThis.fetch = async () => { importRequests++; throw new Error('Unexpected default network request'); };
  try {
    for (const origin of ['http://auth.localhost:1355', 'https://custom-auth.example.test']) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin } } });
      const moduleURL = new URL('../src/lib/auth-client.ts', import.meta.url);
      moduleURL.searchParams.set('browser', origin);
      const { authClient } = await import(moduleURL.href);
      assert.equal(importRequests, 0);
      const calls: Array<[unknown, RequestInit | undefined]> = [];
      await authClient.signIn.magicLink({
        email: 'fixture@example.test', callbackURL: '/dashboard',
        fetchOptions: { customFetchImpl: async (url: unknown, init?: RequestInit) => { calls.push([url, init]); return Response.json({ status: true }); } },
      });
      assert.equal(String(calls[0][0]), `${origin}/api/auth/sign-in/magic-link`);
      assert.equal(calls[0][1]?.method, 'POST');
      assert.equal(calls[0][1]?.credentials, 'include');
      assert.equal(JSON.parse(String(calls[0][1]?.body)).email, 'fixture@example.test');
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
