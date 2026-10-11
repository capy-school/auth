import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(vite, /plugins: \[sveltekit\(\)\]/);
  assert.match(vite, /envDir: 'src\/kit'/);
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

test('only diagnostic routes exist and candidate sources cannot import the auth runtime', () => {
  read('src/kit/app.html');
  const routes = readdirSync(new URL('../src/kit/routes/', import.meta.url), { recursive: true });
  assert.deepEqual(routes.filter((path) => /\.(svelte|ts|js)$/.test(path)).sort(), [
    '__migration/+page.svelte',
    '__migration/health/+server.ts',
  ]);
  for (const path of candidateFiles.filter((path) => path.startsWith('src/kit/'))) {
    assert.doesNotMatch(read(path), /better-auth|better-call|local-auth|local-inbox|node:(fs|path|url)|src\/(lib|db)/);
  }
  assert.match(read('src/kit/app.html'), /%sveltekit\.head%/);
  assert.match(read('src/kit/app.html'), /%sveltekit\.body%/);
  assert.match(read('README.md'), /Do not deploy the candidate/);
});
