import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  'src/kit/routes/__migration/+page.svelte',
  'src/kit/routes/__migration/health/+server.ts',
  'src/kit/routes/__migration/login/+page.svelte',
  'src/kit/lib/login/LoginShell.svelte',
  'src/kit/lib/login/AuthButton.svelte',
  'src/kit/lib/login/OAuthProviders.svelte',
];

test('the non-default diagnostic candidate has its own configuration and sources', () => {
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

test('candidate scripts are opt-in and tooling versions are pinned', () => {
  const { scripts, dependencies, devDependencies } = JSON.parse(read('package.json'));
  const commands = {
    'kit:dev': 'vite --config vite.sveltekit.config.ts',
    'kit:check': 'svelte-kit sync && svelte-check --tsconfig ./tsconfig.sveltekit.json',
    'kit:build': 'vite build --config vite.sveltekit.config.ts',
    'kit:test': 'node --test tests/kit-config.test.mjs',
  };
  for (const [name, command] of Object.entries(commands)) {
    assert.equal(scripts[name], command, name);
  }
  const versions = {
    '@sveltejs/kit': '2.70.3',
    svelte: '5.57.2',
    '@sveltejs/vite-plugin-svelte': '5.1.1',
    '@sveltejs/adapter-cloudflare': '7.2.9',
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
    routes: 'src/kit/routes',
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
  assert.equal(config.kit.adapter.name, '@sveltejs/adapter-cloudflare');
  assert.equal(config.kit.adapter.emulate, undefined);
  assert.match(source, /adapter\(\{ config: 'wrangler\.sveltekit\.jsonc' \}\)/);
  const vite = read('vite.sveltekit.config.ts');
  assert.match(vite, /import \{ sveltekit \} from '@sveltejs\/kit\/vite'/);
  assert.match(vite, /import tailwindcss from '@tailwindcss\/vite'/);
  assert.match(vite, /plugins: \[tailwindcss\(\), sveltekit\(\)\]/);
  assert.match(vite, /envDir: 'src\/kit'/);
});

test('dev adds only shared styles while preserving Kit serving paths and Vite deny rules', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = await resolveConfig({ configFile: resolve(root, 'vite.sveltekit.config.ts') }, 'serve');
  const { allow, deny, strict } = config.server.fs;
  const kitRuntime = fileURLToPath(new URL('../../runtime', import.meta.resolve('@sveltejs/kit/vite')));
  assert.deepEqual(new Set(allow), new Set([
    ...['src/styles', 'src/kit/lib', 'src/kit/routes', 'src/kit', '.svelte-kit', 'node_modules']
      .map(path => resolve(root, path)),
    kitRuntime,
  ]));
  assert.equal(strict, true);
  assert.deepEqual(deny, ['.env', '.env.*', '*.{crt,pem}', '**/.git/**']);
  for (const path of ['.', 'src', 'src/lib', 'src/db', '.env', 'local.db']) {
    const target = resolve(root, path);
    assert.ok(!allow.some(dir => target === dir || target.startsWith(`${dir}/`)), path);
  }
});

test('candidate Wrangler is an allowlisted local-only Worker configuration', () => {
  assert.deepEqual(JSON.parse(read('wrangler.sveltekit.jsonc')), {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: 'auth-sveltekit-candidate',
    main: '.svelte-kit/cloudflare/_worker.js',
    compatibility_date: '2026-04-12',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    preview_urls: false,
    assets: {
      directory: '.svelte-kit/cloudflare',
      binding: 'ASSETS',
    },
  });
});

test('TypeScript checks exclude existing Astro and authentication sources', () => {
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

test('only diagnostic and presentation routes exist and all candidate modules remain backend-free', () => {
  read('src/kit/app.html');
  const routes = readdirSync(new URL('../src/kit/routes/', import.meta.url), { recursive: true });
  assert.deepEqual(routes.filter((path) => /\.(svelte|ts|js)$/.test(path)).sort(), [
    '__migration/+page.svelte',
    '__migration/api-key-dialog/+page.svelte',
    '__migration/health/+server.ts',
    '__migration/login/+page.svelte',
    '__migration/passkeys/+page.svelte',
  ]);
  const modules = readdirSync(new URL('../src/kit/', import.meta.url), { recursive: true });
  for (const path of modules.filter((path) => /\.(svelte|[cm]?[jt]s)$/.test(path))) {
    const source = read(`src/kit/${path}`);
    assert.doesNotMatch(source, /better-auth|better-call|@libsql|kysely|local-(auth|inbox|client|policy)|auth-client|astro:|node:(fs|path|url)|src\/(lib|db)|(?:\.\.\/)+(lib|db)\//, path);
    assert.doesNotMatch(source, /import\.meta\.env|process\.env|\$env|\$app\/navigation|localStorage|\bfetch\s*\(|\bcookies\b|\bfrom\s*['"](?:fs|path|url)['"]/, path);
  }
  assert.match(read('src/kit/app.html'), /%sveltekit\.head%/);
  assert.match(read('src/kit/app.html'), /%sveltekit\.body%/);
  assert.match(read('README.md'), /Do not deploy the candidate/);
});
