import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer as createViteServer } from 'vite';
import { apiUpstream, kitProxy, kitProxyServer } from '../scripts/kit-proxy.mjs';

test('development upstream is an origin, not credentials, a path or injected config', () => {
  assert.equal(apiUpstream(), 'http://127.0.0.1:4321');
  assert.equal(apiUpstream('https://API.example.test:8443/'), 'https://api.example.test:8443');
  assert.equal(apiUpstream('http://[::1]:4321'), 'http://[::1]:4321');
  for (const value of ['', 'ftp://api.test', 'https://user:password@api.test', 'https://api.test/path', 'https://api.test/?x=1', 'https://api.test/#', 'https://api.test/?', 'https://api.test;evil', 'https://api.test\n', 'http://api.test:0', 'http://api.test:65536']) {
    assert.throws(() => apiUpstream(value), /API_UPSTREAM/, value);
  }
});

test('proxy exposes no browser runtime configuration and verifies upstream TLS', () => {
  const rules = kitProxy('https://api.example.test');
  assert.equal(Object.keys(rules).length, 1);
  const [rule] = Object.values(rules);
  assert.equal(rule.target, 'https://api.example.test');
  assert.equal(rule.secure, true);
  assert.equal(rule.changeOrigin, true);
  assert.equal(rule.rewrite, undefined);
  assert.equal(Object.keys(kitProxy(undefined, true)).length, 2);
  assert.equal(kitProxy(undefined, true)['^/dev/inbox(?:[/?]|$)'].changeOrigin, false);
  assert.equal(kitProxyServer().cors, false);
});

test('diagnostic previews never proxy API or inbox, even with inherited local settings', () => {
  assert.deepEqual(kitProxyServer('https://api.example.test', true, true), { cors: false });
});

test('real Vite proxy preserves API prefix, query, methods, bodies, cookies and errors', async () => {
  const backend = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.statusCode = request.url.startsWith('/api/unauthorized') ? 401 : 207;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Set-Cookie', ['first=one; Path=/; HttpOnly', 'second=two; Path=/; SameSite=Lax']);
    response.end(JSON.stringify({ method: request.method, path: request.url, body: Buffer.concat(chunks).toString(), cookie: request.headers.cookie, origin: request.headers.origin }));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const directory = await mkdtemp('/tmp/opencode/auth-kit-proxy-');
  let vite;
  try {
    vite = await createViteServer({
      configFile: false, root: directory, envDir: directory, appType: 'custom', logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, ...kitProxyServer(`http://127.0.0.1:${backend.address().port}`) },
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    for (const [method, path] of [['GET', '/api?which=x%2Fy'], ['POST', '/api/auth/example%2Fname?next=%2Fa%3Fb'], ['PATCH', '/api/user'], ['DELETE', '/api/user'], ['OPTIONS', '/api'], ['GET', '/api/unauthorized']]) {
      const body = ['POST', 'PATCH', 'DELETE'].includes(method) ? 'literal=%26+body' : undefined;
      const response = await fetch(origin + path, { method, body, headers: { Cookie: 'session=opaque', Origin: origin } });
      assert.equal(response.status, path.includes('unauthorized') ? 401 : 207);
      assert.deepEqual(response.headers.getSetCookie(), ['first=one; Path=/; HttpOnly', 'second=two; Path=/; SameSite=Lax']);
      assert.deepEqual(await response.json(), { method, path, body: body || '', cookie: 'session=opaque', origin });
    }
    const unknown = await fetch(origin + '/apix?not=api');
    assert.equal(unknown.status, 404);
    assert.equal((await fetch(origin + '/dev/inbox')).status, 404);
  } finally {
    await vite?.close();
    await new Promise((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
