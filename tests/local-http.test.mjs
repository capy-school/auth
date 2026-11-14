import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { kitProxyServer } from '../scripts/kit-proxy.mjs';
import { createLocalAuth } from '../api/src/lib/local-auth.ts';
import { localPolicy, magicLinkDestination } from '../shared/local-policy.mjs';

let temporary, child, origin, transport, output = '';
const root = fileURLToPath(new URL('../', import.meta.url));
const request = (path, init = {}, target = transport) => {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${target}${url.pathname}${url.search}`, { method: init.method, headers: { host: new URL(origin).host, ...init.headers } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const headers = new Headers();
        for (let i = 0; i < response.rawHeaders.length; i += 2) headers.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
        resolve(new Response([204, 304].includes(response.statusCode) ? null : Buffer.concat(chunks), { status: response.statusCode, headers }));
      });
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end(init.body);
  });
};

before(async () => {
  // Copy only API source and pure shared policy. Never load root env/storage.
  temporary = await mkdtemp('/tmp/opencode/auth-api-http-');
  await cp(`${root}api/src`, `${temporary}/api/src`, { recursive: true });
  await cp(`${root}shared`, `${temporary}/shared`, { recursive: true });
  await symlink(`${root}node_modules`, `${temporary}/node_modules`, 'dir');
  await writeFile(`${temporary}/api/package.json`, '{"type":"module"}');
  await writeFile(`${temporary}/api/astro.config.mjs`, `export default { output:'server', envDir:${JSON.stringify(temporary)}, vite:{server:{cors:false}}, devToolbar:{enabled:false} };`);
  await mkdir(`${temporary}/.local-auth`);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  origin = `http://auth.localhost:${port}`;
  transport = `http://127.0.0.1:${port}`;
  const databaseURL = `file://${temporary}/.local-auth/auth.db`;
  const secret = 'isolated-http-contract-secret-not-for-production';
  const instance = await createLocalAuth({ origin, databaseURL, secret }, true);
  await instance.close();
  child = spawn(process.execPath, [`${root}node_modules/astro/astro.js`, 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: `${temporary}/api`, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, HOME: temporary, NODE_ENV: 'development', ASTRO_TELEMETRY_DISABLED: '1', AUTH_LOCAL_MODE: '1', PUBLIC_AUTH_LOCAL_MODE: '1', AUTH_BASE_URL: origin, PUBLIC_AUTH_URL: origin, AUTH_LOCAL_DATABASE_URL: databaseURL, AUTH_LOCAL_SECRET: secret },
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { if ((await request('/api/session')).status === 401) return; } catch { /* Server not listening yet. */ }
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Isolated Astro API did not start:\n${output}`);
});
after(async () => {
  if (child && child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test('local Astro API accepts same-origin magic links with cookies and rejects foreign origins', async () => {
  for (const [requestOrigin, expected] of [[origin, 200], ['http://evil.localhost', 403]]) {
    const response = await request('/api/auth/sign-in/magic-link', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: requestOrigin, cookie: 'local-smoke=1' },
      body: JSON.stringify({ email: `origin-${Date.now()}@example.test`, callbackURL: `${origin}/dashboard` }),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    if (expected === 403) assert.equal(body.code, 'INVALID_ORIGIN');
  }
});

test('local inbox works through the real Vite proxy while still rejecting a foreign public Host', async () => {
  const vite = await createViteServer({
    configFile: false, root: temporary, envDir: temporary, appType: 'custom', logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, ...kitProxyServer(transport, true) },
  });
  try {
    await vite.listen();
    const proxy = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const inbox = await request('/dev/inbox?from=proxy', {}, proxy);
    assert.equal(inbox.status, 200, 'Vite must preserve the public Host required by the Astro inbox');
    assert.equal(inbox.headers.get('cache-control'), 'no-store');
    assert.match(await inbox.text(), /Local Auth inbox/);
    assert.equal((await request('/dev/inbox', { headers: { host: 'evil.localhost' } }, proxy)).status, 404);
    assert.equal((await request('/api/session', {}, proxy)).status, 401);
    assert.equal((await request('/dev/inbox-other', {}, proxy)).status, 404);
  } finally { await vite.close(); }
});

test('local Astro API preserves inbox, signed session, scoped CORS, bridge and one-use OTT completion', async () => {
  const policy = localPolicy(true, '1', origin);
  const target = `${policy.appOrigins[0]}/courses?source=auth-smoke`;
  const callbackURL = magicLinkDestination(target, origin, policy);
  const email = `smoke-${Date.now()}@example.test`;
  assert.equal((await request('/api/auth/sign-in/magic-link', {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, callbackURL, newUserCallbackURL: callbackURL }),
  })).status, 200);
  const inbox = await request('/dev/inbox');
  assert.equal(inbox.status, 200, output);
  assert.equal(inbox.headers.get('cache-control'), 'no-store');
  const entry = [...(await inbox.text()).matchAll(/href="([^"]+)"[^>]*>Sign in as ([^<]+)</g)].find(match => match[2] === email);
  assert.ok(entry, 'New message must render in the local inbox');
  const link = entry[1].replaceAll('&amp;', '&');
  const login = await request(link);
  assert.equal(login.status, 302);
  const cookies = login.headers.getSetCookie();
  const cookie = cookies.map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('better-auth.session_token='));
  assert.ok(cookies.every(value => !/;\s*domain=/i.test(value)));
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
  assert.ok(((await request(link)).headers.get('location') ?? '').includes('error='));
  for (const allowed of policy.appOrigins) {
    const cors = await request('/api/session', { method: 'OPTIONS', headers: { origin: allowed } });
    assert.equal(cors.headers.get('access-control-allow-origin'), allowed);
  }
  for (const denied of ['http://evil.school.localhost', 'https://capyschool.com']) {
    const cors = await request('/api/auth/get-session', { method: 'OPTIONS', headers: { origin: denied } });
    assert.equal(cors.headers.get('access-control-allow-origin'), null);
    const refused = await request(`/api/sso/bridge?${new URLSearchParams({ redirect: denied })}`, { headers: { cookie } });
    assert.equal(new URL(refused.headers.get('location')).origin, origin);
  }
});
