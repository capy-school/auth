import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import test from 'node:test';

const output = new URL('../.svelte-kit/static/', import.meta.url);
const pages = [
  ['/__migration/', 'SvelteKit migration diagnostic', []],
  ['/__migration/login/', 'Login presentation preview only',
    ['Sign in with Passkey', 'Sign in with Email', 'Google', 'GitHub', 'Microsoft', 'Kakao', 'Naver', 'Line']],
  ['/__migration/passkeys/', 'Passkey management preview only', ['Add Passkey']],
  ['/__migration/api-key-dialog/', 'Fictional dialog fixture', ['Reopen fictional dialog (preview only)', 'Copy', "I've saved my key"]],
  ['/__migration/api-keys/', 'Fictional data and requests only', ['Generate Key']],
];
const marker = {
  kind: 'static-build',
  candidate: 'sveltekit-static-diagnostic',
  authentication: false,
};

function artifact() {
  assert.ok(existsSync(output), 'kit:build must produce a standalone static artifact');
  const files = new Map();
  for (const path of readdirSync(output, { recursive: true })) {
    const file = new URL(path, output);
    if (statSync(file).isFile()) files.set(`/${path}`, readFileSync(file));
  }
  return files;
}

function assertInitialControls(html, path, labels) {
  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(buttons.map(([, body]) => body.replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '').trim()), labels,
    `${path}: native buttons must already exist in the HTML`);
  if (path === '/__migration/login/') assert.doesNotMatch(html, /<input\b|<form\b/);
  if (path === '/__migration/passkeys/') {
    assert.match(html, /<input\b[^>]*value="My device"/, 'device input must be prerendered');
  }
  if (path === '/__migration/api-keys/') {
    assert.match(html, /<form\b[^>]*id="apiKeyForm"/, 'API-key form must be prerendered');
    assert.match(html, /<input\b(?=[^>]*id="keyName")(?=[^>]*\brequired\b)[^>]*>/, 'required key-name input must be prerendered');
  }
  if (path === '/__migration/api-key-dialog/') {
    const dialog = html.match(/<div id="newKeyModal"[^>]*>/)?.[0];
    assert.ok(dialog, 'initial dialog must be prerendered');
    assert.doesNotMatch(dialog, /\bhidden\b|display:\s*none/, 'initial dialog must be visible');
  }
}

test('deployment artifact contains real HTML and fixed JSON, not a server renderer', () => {
  const files = artifact();
  for (const [path, visible, labels] of pages) {
    const html = files.get(`${path}index.html`)?.toString();
    assert.ok(html, `Missing prerendered page: ${path}`);
    assert.match(html, /<!doctype html>/i);
    assert.ok(html.includes(visible), `${path} must contain visible content before JavaScript`);
    assert.match(html, /\bimport\(/, `${path} must retain hydration`);
    assert.match(html, /name="robots" content="noindex"/);
    assertInitialControls(html, path, labels);
  }
  assert.deepEqual(JSON.parse(files.get('/__migration/build.json')?.toString() || 'null'), marker);
  for (const path of files.keys()) {
    assert.doesNotMatch(path, /(?:^|\/)(?:_worker\.js|server|manifest-full\.js)(?:\/|$)/);
    assert.doesNotMatch(path, /^\/api\//);
  }
  assert.equal(files.has('/index.html'), false, 'No fabricated root login or SPA fallback');
});

test('artifact control checks reject notice-only HTML and missing initial form/dialog state', () => {
  const files = artifact();
  const cases = [
    ['/__migration/login/', html => html.replace(/<button\b[\s\S]*?<\/button>/g, ''), /native buttons/],
    ['/__migration/passkeys/', html => html.replace(/<input\b[^>]*>/g, ''), /device input/],
    ['/__migration/api-keys/', html => html.replace(/<form\b[^>]*>/g, ''), /API-key form/],
    ['/__migration/api-keys/', html => html.replace(/<input\b[^>]*>/g, ''), /required key-name input/],
    ['/__migration/api-key-dialog/', html => html.replace('id="newKeyModal"', 'id="newKeyModal" hidden'), /initial dialog must be visible/],
  ];
  for (const [path, mutate, expected] of cases) {
    const labels = pages.find(([page]) => page === path)[2];
    assert.throws(() => assertInitialControls(mutate(files.get(`${path}index.html`).toString()), path, labels), expected);
  }
});

test('a plain file host serves pages, JSON and hydration assets without SSR or cookies', async (t) => {
  const files = artifact();
  const contentTypes = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
  // This host only returns existing file bytes. It cannot render Svelte or proxy an API.
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const key = path.endsWith('/') ? `${path}index.html` : path;
    const bytes = files.get(key);
    if (!bytes) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader('Content-Type', contentTypes[extname(key)] || 'application/octet-stream');
    response.end(bytes);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, headers) => fetch(new URL(path, origin), {
    headers, redirect: 'manual', signal: AbortSignal.timeout(10_000),
  });
  for (const [path] of pages) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('set-cookie'), null);
    const html = await response.text();
    assert.equal(html, files.get(`${path}index.html`).toString());
    const refs = [...html.matchAll(/(?:\bimport\(["']|\bhref=["'])([^"']+\.(?:js|css))["']/g)];
    assert.ok(refs.some(([, ref]) => ref.endsWith('.js')), `${path}: hydration entry missing`);
    for (const [, ref] of refs) {
      const assetPath = new URL(ref, new URL(path, origin)).pathname;
      const asset = await request(assetPath);
      assert.equal(asset.status, 200, assetPath);
      assert.equal(asset.headers.get('set-cookie'), null);
      assert.deepEqual(Buffer.from(await asset.arrayBuffer()), files.get(assetPath));
    }
  }
  const metadata = await request('/__migration/build.json');
  assert.equal(metadata.status, 200);
  assert.match(metadata.headers.get('content-type'), /application\/json/);
  assert.equal(metadata.headers.get('set-cookie'), null);
  assert.deepEqual(await metadata.json(), marker);
  const withCookie = await request('/__migration/login/', { Cookie: 'better-auth.session_token=fictional' });
  assert.equal(withCookie.headers.get('set-cookie'), null);
  assert.equal(await withCookie.text(), files.get('/__migration/login/index.html').toString());
  for (const path of ['/', '/api/auth/get-session', '/missing', '/_app/missing.js', '/__migration/health']) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('set-cookie'), null);
    await response.body?.cancel();
  }
});
