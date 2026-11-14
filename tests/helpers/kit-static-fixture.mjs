import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { access, mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalAuth } from '../../api/src/lib/local-auth.ts';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

/** Plain file host + real Better Auth in an owned temporary database, never SSR. */
export async function kitStaticFixture({ directory = '.svelte-kit/static' } = {}) {
  const files = resolve(directory);
  await access(join(files, 'index.html'));
  const state = await mkdtemp('/tmp/opencode/auth-kit-static-');
  await mkdir(join(state, '.local-auth'));
  const requests = [];
  const errors = [];
  const events = new EventEmitter();
  let auth, origin, sessionOverride = null;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (/^\/api(?:\/|$)/.test(url.pathname)) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        requests.push({ method: request.method, path: url.pathname, search: url.search, body: body.toString() });
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
        const webRequest = new Request(url, {
          method: request.method, headers,
          ...(!['GET', 'HEAD'].includes(request.method) ? { body } : {}),
        });
        let result;
        if (url.pathname === '/api/session') {
          if (sessionOverride) {
            result = new Response(typeof sessionOverride.body === 'string' ? sessionOverride.body : JSON.stringify(sessionOverride.body ?? { error: 'Isolated session failure' }), { status: sessionOverride.status, headers: { 'Content-Type': 'application/json' } });
          } else {
            const session = await auth.auth.api.getSession({ headers });
            result = new Response(JSON.stringify(session || { error: 'Unauthorized' }), { status: session ? 200 : 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
          }
        } else result = await auth.auth.handler(webRequest);
        response.statusCode = result.status;
        result.headers.forEach((value, name) => { if (name !== 'set-cookie') response.setHeader(name, value); });
        const cookies = result.headers.getSetCookie();
        if (cookies.length) response.setHeader('Set-Cookie', cookies);
        response.end(request.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()));
        events.emit('response', { path: url.pathname, status: result.status });
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      let path;
      try { path = resolve(files, '.' + decodeURIComponent(url.pathname)); }
      catch { response.writeHead(400).end(); return; }
      if (path !== files && !path.startsWith(files + sep)) {
        response.writeHead(404).end();
        return;
      }
      try {
        if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
        const bytes = await readFile(path);
        response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
        response.end(request.method === 'HEAD' ? undefined : bytes);
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) throw error;
        response.writeHead(404).end('Not found');
      }
    } catch (error) {
      errors.push(error.message);
      response.writeHead(500).end('Isolated fixture failure');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  origin = `http://auth.localhost:${port}`;
  const loopbackOrigin = `http://127.0.0.1:${port}`;
  try {
    auth = await createLocalAuth({ origin, databaseURL: pathToFileURL(join(state, '.local-auth/auth.db')).href, secret: 'isolated-kit-browser-contract-secret-over-32-characters' }, true);
  } catch (error) {
    await new Promise(resolve => server.close(resolve));
    await rm(state, { recursive: true, force: true });
    throw error;
  }
  return {
    origin, loopbackOrigin, requests, errors, inbox: auth.inbox,
    overrideSession(status, body) { sessionOverride = status === null ? null : { status, body }; },
    waitForResponse(path) {
      return new Promise((resolve, reject) => {
        const clean = () => { clearTimeout(timer); events.off('response', received); events.off('close', closed); };
        const received = result => { if (result.path === path) { clean(); resolve(result); } };
        const closed = () => { clean(); reject(new Error('Fixture closed before API response')); };
        const timer = setTimeout(() => { clean(); reject(new Error(`API response timeout: ${path}`)); }, 12000);
        events.on('response', received);
        events.once('close', closed);
      });
    },
    request(path, init = {}) {
      const url = new URL(path, origin);
      if (url.origin !== origin) throw new Error('Fixture requests cannot leave the isolated Auth origin');
      const headers = new Headers({ Host: new URL(origin).host, Origin: origin });
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
      return fetch(loopbackOrigin + url.pathname + url.search, { ...init, headers });
    },
    async close() {
      events.emit('close');
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      try { await auth.close(); } finally { await rm(state, { recursive: true, force: true }); }
    },
  };
}
