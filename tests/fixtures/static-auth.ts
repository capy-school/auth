// Test-only API. Copied into an independent temporary build context, never tiny.
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { createLocalAuth } from '../../api/src/lib/local-auth';

const origin = process.env.PUBLIC_ORIGIN;
if (!origin) throw new Error('Test PUBLIC_ORIGIN is required');
await mkdir('/state/.local-auth', { recursive: true, mode: 0o700 });
const instance = await createLocalAuth({
  origin, databaseURL: 'file:///state/.local-auth/auth.db',
  secret: 'isolated-image-browser-auth-secret-over-32-characters',
}, true);

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || '/', origin);
    if (url.pathname === '/api/__test/ready' || url.pathname === '/api/__test/inbox') {
      outgoing.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      outgoing.end(JSON.stringify(url.pathname.endsWith('/inbox') ? instance.inbox.list() : { ready: true }));
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    let result: Response;
    if (url.pathname === '/api/session') {
      const session = await instance.auth.api.getSession({ headers });
      result = new Response(JSON.stringify(session || { error: 'Unauthorized' }), { status: session ? 200 : 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const request = new Request(url, { method: incoming.method, headers, ...(!['GET', 'HEAD'].includes(incoming.method || 'GET') ? { body: Buffer.concat(chunks) } : {}) });
      result = await instance.auth.handler(request);
    }
    outgoing.statusCode = result.status;
    result.headers.forEach((value, name) => { if (name !== 'set-cookie') outgoing.setHeader(name, value); });
    const cookies = result.headers.getSetCookie();
    if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
    outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Isolated API error');
    outgoing.writeHead(500).end('Isolated API failed');
  }
}).listen(3000, '0.0.0.0', () => console.info('Isolated test API ready'));
