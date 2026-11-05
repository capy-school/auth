import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const output = new URL('../.svelte-kit/static/', import.meta.url);
const routes = ['', 'dashboard/', 'logout/', ...['security', 'sessions', 'passkey', '2fa', 'api-keys', 'organizations'].map(section => `settings/${section}/`)];

test('production prerenders all nine real routes with hydration and no personal or diagnostic fixtures', () => {
  for (const route of routes) {
    const path = new URL(`${route}index.html`, output);
    assert.ok(existsSync(path), `Missing production HTML: /${route}; run serialized kit:build first`);
    const html = readFileSync(path, 'utf8');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /\bimport\(/, `/${route} must hydrate`);
    assert.doesNotMatch(html, /__migration|John Doe|john@|FICTIONAL-NOT-A-KEY|fictional-|better-auth\.session_token|sessionToken|access_token|refresh_token/i);
    if (route) assert.doesNotMatch(html, /user@example|Example device|Local User|Admin User/i);
  }
});

test('static production artifact excludes API, diagnostic and development routes and server renderers', () => {
  assert.ok(existsSync(output), 'Run serialized kit:build first');
  for (const path of readdirSync(output, { recursive: true })) {
    assert.doesNotMatch(path, /^(?:__migration|api|dev)(?:\/|$)|(?:^|\/)(?:_worker\.js|server|manifest-full\.js)(?:\/|$)/, path);
    const file = new URL(path, output);
    if (statSync(file).isFile() && /\.(?:js|html)$/.test(path)) {
      // The SDK names NUXT_PUBLIC_AUTH_URL, and the approved redirect registry
      // legitimately contains localhost:4321. Neither is a compiled upstream.
      assert.doesNotMatch(readFileSync(file, 'utf8'), /\bPUBLIC_AUTH_URL\b|\bAPI_UPSTREAM\b|\bTURSO_AUTH_TOKEN\b|\bBETTER_AUTH_SECRET\b|transport-only\.invalid/, path);
    }
  }
  assert.equal(existsSync(new URL('200.html', output)), false, 'No global SPA login fallback');
});
