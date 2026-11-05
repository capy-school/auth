import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveConfig } from 'vite';

const read = (path) => {
  const url = new URL(`../${path}`, import.meta.url);
  assert.ok(existsSync(url), `Missing candidate file: ${path}`);
  return readFileSync(url, 'utf8');
};
const candidateFiles = [
  'svelte.config.js',
  'vite.sveltekit.config.ts',
  'tsconfig.sveltekit.json',
  'wrangler.sveltekit.jsonc',
  'src/kit/app.html',
  'src/kit/app.d.ts',
  'src/kit/routes/+layout.ts',
  'src/kit/routes/+layout.svelte',
  'src/kit/routes/+page.svelte',
  'src/kit/diagnostic-routes/+layout.ts',
  'src/kit/diagnostic-routes/__migration/+page.svelte',
  'src/kit/diagnostic-routes/__migration/build.json/+server.ts',
  'src/kit/diagnostic-routes/__migration/login/+page.svelte',
  'src/kit/lib/login/LoginShell.svelte',
  'src/kit/lib/login/AuthButton.svelte',
  'src/kit/lib/login/OAuthProviders.svelte',
];

test('production and opt-in diagnostics have separate route trees and shared presentation sources', () => {
  for (const path of candidateFiles) {
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `Missing candidate file: ${path}`);
  }
});

test('existing Astro and operational commands remain unchanged', () => {
  const { scripts } = JSON.parse(read('package.json'));
  const existing = {
    dev: 'PORTLESS_HTTPS=0 portless auth astro dev',
    'dev:setup': 'tsx scripts/setup-local.ts',
    'test:local': 'node --import tsx --test tests/local-*.test.*',
    build: 'node scripts/build-cf.mjs',
    preview: 'astro preview',
    'cf:types': 'wrangler types',
    deploy: 'wrangler deploy',
    astro: 'astro',
    'db:generate': '@better-auth/cli generate',
    'db:migrate': '@better-auth/cli migrate',
    'db:seed': 'tsx src/db/seed.ts',
  };
  for (const [name, command] of Object.entries(existing)) {
    assert.equal(scripts[name], command, name);
  }
});

test('Kit production and diagnostic commands are explicit and tooling versions are pinned', () => {
  const { scripts, dependencies, devDependencies } = JSON.parse(read('package.json'));
  const commands = {
    'kit:dev': 'vite --config vite.sveltekit.config.ts',
    'kit:check': 'svelte-kit sync && svelte-check --tsconfig ./tsconfig.sveltekit.json',
    'kit:build': 'vite build --config vite.sveltekit.config.ts',
    'kit:test': 'node --test tests/kit-config.test.mjs',
    'kit:diagnostic:dev': 'KIT_DIAGNOSTICS=1 vite --config vite.sveltekit.config.ts',
    'kit:diagnostic:build': 'KIT_DIAGNOSTICS=1 vite build --config vite.sveltekit.config.ts',
  };
  for (const [name, command] of Object.entries(commands)) {
    assert.equal(scripts[name], command, name);
  }
  const versions = {
    '@sveltejs/kit': '2.70.3',
    svelte: '5.57.2',
    '@sveltejs/vite-plugin-svelte': '5.1.1',
    '@sveltejs/adapter-cloudflare': '7.2.9',
    '@sveltejs/adapter-static': '3.0.10',
    'svelte-check': '4.7.6',
    typescript: '5.9.3',
    vite: '6.4.1',
    '@better-auth/cli': '1.3.34',
  };
  for (const [name, version] of Object.entries(versions)) {
    assert.equal(devDependencies[name], version, name);
  }
  assert.equal(dependencies['better-auth'], '1.3.34');
});

test('Kit configuration confines source and environment discovery to the candidate', async () => {
  const source = read('svelte.config.js');
  const { default: config } = await import('../svelte.config.js');
  assert.deepEqual(config.kit.files, {
    src: 'src/kit',
    assets: 'public',
    routes: process.env.KIT_DIAGNOSTICS === '1' ? 'src/kit/diagnostic-routes' : 'src/kit/routes',
    lib: 'src/kit/lib',
    hooks: {
      client: 'src/kit/hooks.client',
      server: 'src/kit/hooks.server',
      universal: 'src/kit/hooks',
    },
    appTemplate: 'src/kit/app.html',
  });
  assert.equal(config.kit.outDir, '.svelte-kit');
  assert.equal(config.kit.env.dir, 'src/kit');
  assert.equal(config.kit.env.publicPrefix, 'PUBLIC_KIT_');
  assert.equal(config.kit.env.privatePrefix, 'KIT_');
  assert.equal(config.kit.adapter.name, '@sveltejs/adapter-static');
  assert.equal(config.kit.adapter.emulate, undefined);
  assert.match(source, /pages: '\.svelte-kit\/static'/);
  assert.match(source, /assets: '\.svelte-kit\/static'/);
  assert.match(source, /strict: true/);
  const vite = read('vite.sveltekit.config.ts');
  assert.match(vite, /import \{ sveltekit \} from '@sveltejs\/kit\/vite'/);
  assert.match(vite, /import tailwindcss from '@tailwindcss\/vite'/);
  assert.match(vite, /plugins: \[tailwindcss\(\), sveltekit\(\)\]/);
  assert.match(vite, /envDir: 'src\/kit'/);
});

test('production is the default and only explicit KIT_DIAGNOSTICS=1 selects preserved previews', () => {
  for (const [flag, expected] of [['', 'src/kit/routes'], ['0', 'src/kit/routes'], ['true', 'src/kit/routes'], ['1', 'src/kit/diagnostic-routes']]) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', "import config from './svelte.config.js'; console.log(config.kit.files.routes)"], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, KIT_DIAGNOSTICS: flag }, encoding: 'utf8',
    });
    assert.equal(result.trim(), expected);
  }
});

test('dev permits exact shared client files, never broad application/server roots, and retains Vite deny rules', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = await resolveConfig({ configFile: resolve(root, 'vite.sveltekit.config.ts') }, 'serve');
  assert.equal(config.envPrefix, 'PUBLIC_KIT_');
  const { allow, deny, strict } = config.server.fs;
  const kitRuntime = fileURLToPath(new URL('../../runtime', import.meta.resolve('@sveltejs/kit/vite')));
  const permitted = new Set([
    kitRuntime,
    ...['src/styles', 'src/kit/lib', 'src/kit/routes', 'src/kit/diagnostic-routes', 'src/kit', '.svelte-kit', 'node_modules',
      'src/lib/auth-client.ts', 'src/lib/apps.ts', 'src/lib/local-client.ts', 'src/lib/local-policy.mjs',
      ...['types', 'ui', 'sessions', 'passkeys', 'api-keys', 'two-factor', 'organizations'].map(name => `src/components/account/${name}.ts`),
    ].map(path => resolve(root, path)),
  ]);
  for (const path of allow) assert.ok(permitted.has(path), `Unexpected dev serving permission: ${path}`);
  for (const path of ['src/styles', 'src/kit/lib', 'src/kit', '.svelte-kit', 'node_modules']) assert.ok(allow.includes(resolve(root, path)), path);
  assert.ok(allow.includes(kitRuntime));
  for (const path of ['src/lib/auth-client.ts', 'src/lib/apps.ts', 'src/lib/local-client.ts', 'src/lib/local-policy.mjs']) assert.ok(allow.includes(resolve(root, path)), path);
  assert.equal(strict, true);
  assert.deepEqual(deny, ['.env', '.env.*', '*.{crt,pem}', '**/.git/**']);
  for (const path of ['.', 'src', 'src/lib', 'src/db', 'src/pages', 'src/components/account', 'server', 'server-rust', '.git', '.env', 'local.db']) {
    const target = resolve(root, path);
    assert.ok(!allow.some(dir => target === dir || target.startsWith(`${dir}/`)), path);
  }
});

test('pages render at build time without an SPA fallback', () => {
  const source = read('src/kit/routes/+layout.ts');
  for (const option of ['prerender', 'ssr', 'csr']) {
    assert.match(source, new RegExp(`export const ${option} = true;`));
  }
  assert.match(source, /export const trailingSlash = 'always';/);
  assert.doesNotMatch(read('svelte.config.js'), /\bfallback\s*:/);
  assert.match(read('src/kit/diagnostic-routes/__migration/build.json/+server.ts'), /export const prerender = true;/);
  for (const option of ['prerender', 'ssr', 'csr']) assert.match(read('src/kit/diagnostic-routes/+layout.ts'), new RegExp(`export const ${option} = true;`));
});

test('candidate Wrangler serves only static assets without a Worker or production routes', () => {
  assert.deepEqual(JSON.parse(read('wrangler.sveltekit.jsonc')), {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: 'auth-sveltekit-candidate',
    compatibility_date: '2026-04-12',
    workers_dev: false,
    preview_urls: false,
    assets: {
      directory: '.svelte-kit/static',
    },
  });
});

test('TypeScript entrypoints remain confined to Kit instead of adding backend source roots', () => {
  const candidate = JSON.parse(read('tsconfig.sveltekit.json'));
  assert.equal(candidate.extends, './.svelte-kit/tsconfig.json');
  assert.deepEqual(candidate.include, [
    'src/kit/**/*.ts',
    'src/kit/**/*.svelte',
    '.svelte-kit/*.d.ts',
    '.svelte-kit/types/**/$types.d.ts',
  ]);
  assert.deepEqual(JSON.parse(read('tsconfig.json')), {
    extends: 'astro/tsconfigs/strict',
    include: ['.astro/types.d.ts', '**/*'],
    exclude: ['dist'],
  });
  assert.match(read('.gitignore'), /^\.svelte-kit\/$/m);
});

test('real routes have no server endpoints and diagnostics remain disconnected and isolated', () => {
  read('src/kit/app.html');
  const routes = readdirSync(new URL('../src/kit/routes/', import.meta.url), { recursive: true });
  assert.ok(routes.includes('+page.svelte'));
  assert.ok(routes.includes('dashboard/+page.svelte'));
  assert.ok(routes.includes('logout/+page.svelte'));
  assert.ok(routes.includes('settings/[section]/+page.ts'));
  assert.ok(routes.includes('settings/[section]/+page.svelte'));
  const routeModules = routes.filter(path => /\.(?:svelte|[jt]s)$/.test(path));
  assert.ok(!routeModules.some(path => /__migration|\+server\.|\.server\./.test(path)));
  const diagnostics = readdirSync(new URL('../src/kit/diagnostic-routes/', import.meta.url), { recursive: true });
  assert.deepEqual(diagnostics.filter(path => /\.(svelte|ts|js)$/.test(path)).sort(), [
    '+layout.ts',
    '__migration/+page.svelte',
    '__migration/api-key-dialog/+page.svelte',
    '__migration/api-keys/+page.svelte',
    '__migration/build.json/+server.ts',
    '__migration/login/+page.svelte',
    '__migration/passkeys/+page.svelte',
  ]);
  const modules = readdirSync(new URL('../src/kit/', import.meta.url), { recursive: true });
  for (const path of modules.filter((path) => /\.(svelte|[cm]?[jt]s)$/.test(path))) {
    const source = read(`src/kit/${path}`);
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*|\bimport\(\s*)['"]([^'"]+)['"]/g)].map(([, specifier]) => specifier).join('\n');
    assert.doesNotMatch(imports, /better-auth\/(?:adapters|plugins)|better-call|@libsql|kysely|local-(?:auth|inbox|runtime)|astro:|node:(?:fs|path|url)|(?:^|\n)(?:fs|path|url)(?:\n|$)|(?:\.\.\/)+db\/|lib\/(?:auth|org-auth|env)(?:\.(?:ts|mjs))?(?:\n|$)/, path);
    assert.doesNotMatch(source, /PUBLIC_AUTH_URL|PUBLIC_AUTH_LOCAL_MODE|BETTER_AUTH_SECRET|TURSO_AUTH_TOKEN|process\.env/, path);
    if (path.startsWith('diagnostic-routes/') || path.startsWith('lib/login/') || path.startsWith('lib/settings/')) {
      assert.doesNotMatch(source, /auth-client|import\.meta\.env|\$env|localStorage|\bfetch\s*\(|\bcookies\b/, path);
    }
  }
  assert.match(read('src/kit/app.html'), /%sveltekit\.head%/);
  assert.match(read('src/kit/app.html'), /%sveltekit\.body%/);
  assert.match(read('src/kit/lib/auth/session.ts'), /credentials: 'include', cache: 'no-store'/);
  assert.match(read('src/kit/lib/portal/LoginForm.svelte'), /auth-client/);
});
