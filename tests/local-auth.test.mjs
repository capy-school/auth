import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localPolicy, isLocalTarget, postLoginDestination, selectRedirect } from '../src/lib/local-policy.mjs';
import { createInbox } from '../src/lib/local-inbox.mjs';

test('local mode requires DEV and explicit opt-in; production ignores local input', () => {
  assert.equal(localPolicy(false, '1', 'https://auth.capy.town'), null);
  assert.equal(localPolicy(true, undefined, 'http://auth.localhost'), null);
  assert.throws(() => localPolicy(true, '1', 'https://auth.capy.town'));
});
test('local targets are exact origins, including proxy port, without credentials', () => {
  const policy = localPolicy(true, '1', 'http://auth.localhost:1355');
  assert.deepEqual(policy.appOrigins, ['http://school.localhost:1355', 'http://cms.localhost:1355']);
  for (const target of ['http://school.localhost:1355/dashboard', 'http://cms.localhost:1355/']) assert.ok(isLocalTarget(target, policy));
  for (const target of ['http://school.localhost/', 'https://school.localhost:1355/', 'http://evil.school.localhost:1355/', 'http://user@school.localhost:1355/', 'https://capyschool.com/', 'javascript:alert(1)']) assert.equal(isLocalTarget(target, policy), false);
});
test('dashboard stays same-origin; local app bridges; production routing stays legacy', () => {
  const policy = localPolicy(true, '1', 'http://auth.localhost');
  assert.equal(postLoginDestination('/dashboard', policy.authOrigin, policy), '/dashboard');
  assert.equal(postLoginDestination('http://school.localhost/course?a=1', policy.authOrigin, policy), '/api/sso/bridge?redirect=http%3A%2F%2Fschool.localhost%2Fcourse%3Fa%3D1');
  assert.equal(postLoginDestination('https://capyschool.com', policy.authOrigin, policy), '/');
  assert.equal(postLoginDestination('https://cms.capy.town/x', 'https://auth.capy.town', null), 'https://cms.capy.town/x');
  assert.equal(postLoginDestination('https://capyschool.com/x', 'https://auth.capy.town', null), '/api/sso/bridge?redirect=https%3A%2F%2Fcapyschool.com%2Fx');
});
test('explicit invalid query cannot fall back to saved redirect; unavailable storage is harmless', () => {
  const allowed = (app, target) => app === 'capyschool' && target === 'http://school.localhost/';
  const storage = { getItem: key => key === 'app.id' ? 'capyschool' : 'http://school.localhost/' };
  assert.equal(selectRedirect('?app=bad&redirect=https://evil.test', storage, allowed), null);
  assert.equal(selectRedirect('?app=capyschool', storage, allowed), null);
  assert.equal(selectRedirect('', storage, allowed), 'http://school.localhost/');
  assert.equal(selectRedirect('', { getItem() { throw Error('denied'); } }, allowed), '/dashboard');
});
test('inbox expires links and bounds newest messages', () => {
  let now = 0;
  const inbox = createInbox({ now: () => now, limit: 2, ttl: 100 });
  inbox.add({ email: 'a@example.test', url: 'http://auth.localhost/a' });
  inbox.add({ email: 'b@example.test', url: 'http://auth.localhost/b' });
  inbox.add({ email: 'c@example.test', url: 'http://auth.localhost/c' });
  assert.deepEqual(inbox.list().map(m => m.email), ['c@example.test', 'b@example.test']);
  now = 100;
  assert.deepEqual(inbox.list(), []);
});
