import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const exampleUser = { id: 'u', name: 'Alex Example', email: 'alex@example.invalid', role: 'user', emailVerified: true, image: '', twoFactorEnabled: false };

// Actual Svelte account views and controllers, with browser-only session/SDK
// boundaries. The real static router + Better Auth are tested separately.
export async function dashboardFixture() {
  const temporary = await mkdtemp('/tmp/opencode/auth-account-fixture-');
  const component = `${root}tests/dashboard-virtual.svelte`;
  let http;
  try {
    const output = await build({
      root, configFile: false, envDir: temporary, cacheDir: `${temporary}/cache`, logLevel: 'error',
      resolve: { alias: { $lib: `${root}src/lib` } },
      plugins: [{
        name: 'svelte-account-fixture', enforce: 'pre',
        resolveId(id) {
          if (id === 'account-fixture') return '\0account-fixture';
          if (id === component) return component;
          if (id === '$app/navigation') return '\0account-navigation';
          if (id === '$lib/auth/session' || /\/lib\/auth\/session(?:\.ts)?$/.test(id)) return '\0account-session';
          if (id.endsWith('/auth-client')) return '\0account-client';
        },
        load(id) {
          if (id === '\0account-fixture') return `import {mount} from 'svelte';import Fixture from ${JSON.stringify(component)};mount(Fixture,{target:document.getElementById('app')});`;
          if (id === '\0account-navigation') return `export const goto=async(path)=>{location.assign(path)};`;
          if (id === '\0account-session') return `export const readSession=async()=>({state:'authenticated',user:${JSON.stringify(exampleUser)}});`;
          if (id === '\0account-client') return `const call=(path)=>new Proxy(()=>{}, {get:(_,key)=>call([...path,key]),apply:(_,self,args)=>window.__accountCall(path.join('.'),...args)});export const authClient=call([]);`;
          if (id === component) return `<script>
            import Dashboard from '../src/lib/account/Dashboard.svelte';
            import Settings from '../src/routes/settings/[section]/+page.svelte';
            const path=location.pathname.replace(/\\/$/,'');
            const section=path.split('/').at(-1);
          </script>
          {#if path==='/dashboard'}<Dashboard />{:else}<Settings data={{section}} />{/if}`;
        },
      }, svelte({ configFile: false })],
      build: { write: false, minify: false, rollupOptions: { input: 'account-fixture', output: { inlineDynamicImports: true } } },
    });
    const js = output.output.find(item => item.type === 'chunk').code;
    const css = output.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
    return {
      async listen() {
        http = createServer((request, response) => {
          const path = new URL(request.url, 'http://fixture.invalid').pathname;
          response.setHeader('Cache-Control', 'no-store');
          if (path === '/component.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); }
          else if (path === '/component.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
          else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/component.css"></head><body><div id="app"></div><script type="module" src="/component.js"></script></body></html>'); }
        });
        await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${http.address().port}/dashboard`;
      },
      async close() {
        if (http) await new Promise(resolve => { http.closeAllConnections(); http.close(resolve); });
        await rm(temporary, { recursive: true, force: true });
      },
    };
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}
