import { createServer as createViteServer } from 'vite';
import { getViteConfig } from 'astro/config';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const exampleUser = { name: 'Alex Example', email: 'alex@example.invalid', role: 'user', emailVerified: true, image: '' };

export async function dashboardFixture() {
  const temporary = await mkdtemp('/tmp/opencode/auth-dashboard-test-');
  const config = await getViteConfig({
    root, configFile: false, envDir: temporary, cacheDir: `${temporary}/cache`,
    optimizeDeps: { noDiscovery: true, include: ['qrcode'] },
    plugins: [{
      name: 'isolated-account-auth', enforce: 'pre',
      resolveId(id, importer) {
        if (id.endsWith('/lib/auth') && importer?.includes('/src/pages/')) return '\0account-auth-fixture';
        if (id.endsWith('/lib/auth-client')) return '\0account-client-fixture';
      },
      load(id) {
        if (id === '\0account-auth-fixture') return `export const auth={api:{getSession:async({headers})=>headers.has('x-fixture-user')?{user:${JSON.stringify(exampleUser)},session:{id:'current'}}:null}};`;
        if (id === '\0account-client-fixture') return `const call=(path)=>new Proxy(()=>{}, {get:(_,key)=>call([...path,key]),apply:(_,self,args)=>window.__accountCall(path.join('.'),...args)});export const authClient=call([]);`;
      },
    }],
    server: { middlewareMode: true, watch: null, hmr: false },
  }, { root, configFile: false, envDir: temporary, logLevel: 'silent' })({ command: 'serve', mode: 'test' });
  const vite = await createViteServer(config);
  let http;
  try {
    const Dashboard = (await vite.ssrLoadModule('/src/components/dashboard/Dashboard.astro')).default;
    const { experimental_AstroContainer } = await vite.ssrLoadModule('astro/container');
    const container = await experimental_AstroContainer.create();
    const render = (user = exampleUser) => container.renderToString(Dashboard, { props: { user }, partial: false });
    const renderPage = async (page, user = exampleUser, props = {}) => {
      const Page = (await vite.ssrLoadModule('/src/components/account/AccountPage.astro')).default;
      return container.renderToString(Page, { props: { page, user, ...props }, partial: false });
    };
    const paths = { security: 'security', sessions: 'sessions', passkey: 'passkey', '2fa': 'two-factor', 'api-keys': 'api-keys', organizations: 'organizations' };
    return {
      render, renderPage,
      async renderRoute(path, signedIn = false) {
        const Page = (await vite.ssrLoadModule(`/src/pages${path}.astro`)).default;
        return container.renderToResponse(Page, { request: new Request(`http://fixture.invalid${path}`, { headers: signedIn ? { 'x-fixture-user': '1' } : {} }), partial: false });
      },
      async listen() {
        http = createHttpServer(async (request, response) => {
          const path = new URL(request.url, 'http://fixture.invalid').pathname;
          const page = paths[path.replace('/settings/', '')];
          if (path === '/dashboard' || page) {
            try {
              // This Astro version already emits the component's native client
              // script. Injecting another initializer would mount notes twice.
              const html = (await (page ? renderPage(page) : render())).replace('</head>', '<link rel="stylesheet" href="/src/styles/dashboard.css?direct"></head>');
              response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
              response.end(html);
            } catch (error) { response.writeHead(500); response.end(String(error)); }
          } else { vite.middlewares(request, response); }
        });
        await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${http.address().port}/dashboard`;
      },
      async close() {
        if (http) { await new Promise(resolve => { http.closeAllConnections(); http.close(resolve); }); }
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await dashboardFixture();
  console.log(JSON.stringify({ url: await fixture.listen(), fixture: true, authentication: false }));
  process.once('SIGINT', async () => { await fixture.close(); process.exit(0); });
  process.once('SIGTERM', async () => { await fixture.close(); process.exit(0); });
}
