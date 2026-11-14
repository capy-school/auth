import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { resolveConfig } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('frontend defaults use Vite and backend commands explicitly target the API workspace', () => {
  const { scripts, devDependencies } = JSON.parse(read('package.json'));
  for (const name of ['dev', 'build', 'preview']) assert.match(scripts[name], /vite/);
  assert.match(scripts.check, /svelte-check --tsconfig .\/tsconfig.json/);
  for (const name of ['dev', 'build', 'preview', 'deploy', 'cf:types']) assert.match(scripts[`api:${name}`], /--workspace @capy\/auth-api/);
  assert.ok(!Object.keys(scripts).some(name => name.includes('diagnostic')));
  for (const [name, version] of Object.entries({ '@sveltejs/kit': '2.70.3', svelte: '5.57.2', '@sveltejs/adapter-static': '3.0.10', vite: '6.4.1' })) assert.equal(devDependencies[name], version);
});

test('static adapter is strict, conventional and independent from backend environment discovery', async () => {
  const { default: config } = await import('../svelte.config.js');
  assert.deepEqual(config.kit.files, { assets: 'static' });
  assert.deepEqual(config.kit.env, { dir: 'config/frontend', publicPrefix: 'PUBLIC_KIT_', privatePrefix: 'KIT_' });
  assert.equal(config.kit.adapter.name, '@sveltejs/adapter-static');
  assert.match(read('svelte.config.js'), /strict: true/);
  assert.doesNotMatch(read('svelte.config.js'), /\bfallback\s*:|DIAGNOSTIC/);
  assert.match(read('vite.config.ts'), /loadEnv\(mode, 'config\/frontend', \['API_UPSTREAM', 'PUBLIC_KIT_'\]\)/);
});

test('development allows frontend and pure shared policy, never backend, secret or repository roots', async () => {
  const config = await resolveConfig({ configFile: resolve(root, 'vite.config.ts') }, 'serve');
  assert.equal(config.envPrefix, 'PUBLIC_KIT_');
  assert.equal(config.envDir, resolve(root, 'config/frontend'));
  const { allow, deny, strict } = config.server.fs;
  assert.equal(strict, true);
  assert.deepEqual(deny, ['.env', '.env.*', '*.{crt,pem}', '**/.git/**']);
  for (const path of ['src', 'src/lib', 'src/routes', 'shared', '.svelte-kit', 'node_modules']) assert.ok(allow.some(dir => resolve(root, path) === dir || resolve(root, path).startsWith(`${dir}/`)), path);
  for (const path of ['.', 'api', 'server', 'server-rust', '.git', '.env', '.local-auth', 'config/frontend']) {
    const target = resolve(root, path);
    assert.ok(!allow.some(dir => target === dir || target.startsWith(`${dir}/`)), path);
  }
});

test('all real pages prerender with hydration, without server handlers or a BFF', () => {
  const layout = read('src/routes/+layout.ts');
  for (const option of ['prerender', 'ssr', 'csr']) assert.match(layout, new RegExp(`export const ${option} = true;`));
  assert.match(layout, /export const trailingSlash = 'always';/);
  const routes = readdirSync(new URL('../src/routes/', import.meta.url), { recursive: true });
  for (const name of ['+page.svelte', 'dashboard/+page.svelte', 'logout/+page.svelte', 'settings/[section]/+page.svelte']) assert.ok(routes.includes(name));
  assert.ok(!routes.some(path => /__migration|\+server\.|\.server\./.test(path)));
  assert.match(read('src/app.html'), /%sveltekit\.head%/);
  assert.match(read('src/app.html'), /%sveltekit\.body%/);
});

test('type checking is frontend-scoped, with a separate Astro configuration', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.extends, './.svelte-kit/tsconfig.json');
  assert.ok(config.include.includes('src/**/*.svelte'));
  assert.ok(!config.include.some(path => /tests|api/.test(path)));
  assert.equal(JSON.parse(read('api/tsconfig.json')).extends, 'astro/tsconfigs/strict');
});

test('browser modules import no server adapters, framework environment or persistence', () => {
  const modules = readdirSync(new URL('../src/', import.meta.url), { recursive: true });
  for (const path of modules.filter(path => /\.(svelte|[cm]?[jt]s)$/.test(path))) {
    const code = read(`src/${path}`);
    const imports = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*|\bimport\(\s*)['"]([^'"]+)['"]/g)].map(([, specifier]) => specifier).join('\n');
    assert.doesNotMatch(imports, /api\/src|better-auth\/(?:adapters|plugins)|better-call|@libsql|kysely|local-(?:auth|inbox|runtime)|astro:|node:(?:fs|path|url)/, path);
    assert.doesNotMatch(code, /PUBLIC_AUTH_URL|PUBLIC_AUTH_LOCAL_MODE|BETTER_AUTH_SECRET|TURSO_AUTH_TOKEN|process\.env/, path);
  }
  assert.match(read('src/lib/auth/session.ts'), /credentials: 'include', cache: 'no-store'/);
});
