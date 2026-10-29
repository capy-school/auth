import { createServer as createViteServer } from 'vite';
import { getViteConfig } from 'astro/config';
import react from '@astrojs/react';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

// The real page/island, but never the user's environment, database or auth server.
export async function loginFixture({ local = false } = {}) {
  const temporary = await mkdtemp('/tmp/opencode/auth-login-test-');
  const policy = local ? { authOrigin: 'http://auth.localhost', appOrigins: ['http://school.localhost', 'http://cms.localhost'] } : null;
  const config = await getViteConfig({
    root, configFile: false, envDir: temporary, cacheDir: `${temporary}/cache`,
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'lucide-react'] },
    plugins: [{
      name: 'isolated-login-auth', enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('/lib/auth-client')) return '\0login-client-fixture';
        if (id.endsWith('/local-client')) return '\0login-policy-fixture';
      },
      load(id) {
        if (id === '\0login-policy-fixture') return `export const localClientPolicy=${JSON.stringify(policy)};`;
        if (id === '\0login-client-fixture') return `const call=(path)=>new Proxy(()=>{}, {get:(_,key)=>call([...path,key]),apply:(_,self,args)=>window.__loginCall(path.join('.'),...args)});export const authClient=call([]);`;
      },
    }],
    server: { middlewareMode: true, watch: null, hmr: false },
  }, { root, configFile: false, envDir: temporary, integrations: [react()], logLevel: 'silent' })({ command: 'serve', mode: 'test' });
  const vite = await createViteServer(config);
  let http;
  try {
    const Page = (await vite.ssrLoadModule('/src/pages/index.astro')).default;
    const { experimental_AstroContainer } = await vite.ssrLoadModule('astro/container');
    const { default: renderer } = await vite.ssrLoadModule('@astrojs/react/server.js');
    const container = await experimental_AstroContainer.create();
    container.addServerRenderer({ renderer });
    container.addClientRenderer({ name: '@astrojs/react', entrypoint: '/node_modules/@astrojs/react/dist/client.js' });
    const render = () => container.renderToString(Page, { partial: false });
    return {
      render,
      async listen() {
        http = createHttpServer(async (request, response) => {
          const path = new URL(request.url, 'http://fixture.invalid').pathname;
          if (path === '/') {
            try {
              // Container has no dev URL resolver for island metadata.
              const html = (await render())
                .replace(`component-url="${root}src/components/LoginGateway"`, 'component-url="/src/components/LoginGateway.tsx"')
                .replace(/ before-hydration-url="[^"]*"/g, '')
                .replace('</head>', '<link rel="stylesheet" href="/src/styles/global.css?direct"><link rel="stylesheet" href="/src/styles/login.css?direct"></head>');
              response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
              // No HMR client: the fixture has no websocket server or refresh
              // transforms, and must also work with browser storage denied.
              response.end(html);
            } catch (error) { response.writeHead(500); response.end(String(error)); }
          } else if (path === '/dashboard' || path === '/api/sso/bridge') {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end('<!doctype html><title>Fixture destination</title><p>Fixture destination only</p>');
          } else if (path.startsWith('/api/')) {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end('null');
          } else { vite.middlewares(request, response); }
        });
        await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${http.address().port}`;
      },
      async close() {
        if (http) await new Promise(resolve => { http.closeAllConnections(); http.close(resolve); });
        await vite.close();
        await rm(temporary, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await vite.close();
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
