import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('SvelteKit is the only frontend, in the conventional source layout', () => {
  for (const name of ['src/app.html', 'src/app.d.ts', 'src/routes/+page.svelte', 'src/routes/dashboard/+page.svelte', 'src/lib/portal/LoginForm.svelte', 'src/lib/account/controllers/sessions.ts']) {
    assert.ok(existsSync(new URL(`../${name}`, import.meta.url)), name);
  }
  for (const name of ['src/kit', 'src/components', 'src/layouts', 'src/pages', 'astro.config.mjs']) {
    assert.equal(existsSync(new URL(`../${name}`, import.meta.url)), false, name);
  }
  const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true });
  assert.ok(!sources.some(name => /\.(?:astro|tsx)$/.test(name)));
  assert.ok(!sources.some(name => /__migration|diagnostic-routes/.test(name)));
});

test('Astro is an explicit API workspace with the same route files, not a second UI', () => {
  assert.ok(existsSync(new URL('../api/astro.config.mjs', import.meta.url)));
  const pages = readdirSync(new URL('../api/src/pages/', import.meta.url), { recursive: true });
  assert.equal(pages.filter(name => name.endsWith('.ts')).length, 17);
  for (const name of ['api/session.ts', 'api/auth/[...all].ts', 'api/sso/bridge.ts', 'api/sso/complete.ts', 'api/organizations/[slug]/members.ts']) assert.ok(pages.includes(name), name);
  assert.deepEqual(pages.filter(name => name.endsWith('.astro')), ['dev/inbox.astro']);
  assert.ok(existsSync(new URL('../api/src/lib/auth.ts', import.meta.url)));
  assert.equal(read('api/public/.assetsignore'), '_worker.js\n_routes.json\n', 'Cloudflare API assets must not expose worker source');
});

test('default scripts and dependency ownership belong to the frontend', () => {
  const root = JSON.parse(read('package.json'));
  assert.match(root.scripts.dev, /vite/);
  assert.match(root.scripts.build, /vite build/);
  assert.match(root.scripts.preview, /vite preview/);
  assert.match(root.scripts['api:build'], /api/);
  assert.ok(root.workspaces.includes('api'));
  for (const name of ['astro', '@astrojs/cloudflare', '@astrojs/react', 'react', 'react-dom', 'lucide-react', '@libsql/client', 'kysely']) assert.equal(root.dependencies?.[name] ?? root.devDependencies?.[name], undefined, name);
  const api = JSON.parse(read('api/package.json'));
  assert.ok(api.dependencies.astro);
  assert.equal(api.dependencies['better-auth'], '1.3.34');
});

test('shared policy contains no environment, framework or backend imports', () => {
  for (const name of ['shared/apps.ts', 'shared/local-policy.mjs']) {
    const code = read(name);
    assert.doesNotMatch(code, /import\.meta\.env|process\.env|local-client|better-auth|astro|kysely/);
  }
  const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true });
  for (const name of sources.filter(name => /\.(?:ts|mjs|svelte)$/.test(name))) {
    assert.doesNotMatch(read(`src/${name}`), /from\s+['"][^'"]*(?:api\/src|astro:|@libsql|kysely|better-auth\/plugins)[^'"]*['"]/, name);
  }
  assert.ok(resolve('api/src/lib/auth.ts') !== resolve('src/lib/auth-client.ts'));
});
