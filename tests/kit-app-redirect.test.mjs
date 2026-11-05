import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localPolicy, postLoginDestination, magicLinkDestination } from '../src/lib/local-policy.mjs';

test('an allowed same-origin URL with a double-slash path never becomes cross-origin navigation', () => {
  for (const origin of ['https://auth.capy.town', 'http://auth.localhost:1355']) {
    const policy = origin.includes('auth.localhost') ? localPolicy(true, '1', origin) : null;
    const target = `${origin}//foreign.invalid/path?next=one#section`;
    for (const destination of [postLoginDestination(target, origin, policy), magicLinkDestination(target, origin, policy)]) {
      assert.equal(new URL(destination, origin).origin, origin, destination);
      assert.equal(new URL(destination, origin).pathname, '//foreign.invalid/path');
      assert.equal(new URL(destination, origin).search, '?next=one');
      assert.equal(new URL(destination, origin).hash, '#section');
    }
    assert.equal(postLoginDestination('/dashboard', origin, policy), '/dashboard');
  }
});
