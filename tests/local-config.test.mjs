import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkConfig = (overrides, assertion) => spawnSync(process.execPath, [
  '--input-type=module', '-e',
  `import assert from 'node:assert/strict'; import config from './astro.config.mjs'; ${assertion}`,
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    AUTH_LOCAL_MODE: '1',
    PUBLIC_AUTH_LOCAL_MODE: '1',
    AUTH_BASE_URL: 'http://auth.localhost',
    PUBLIC_AUTH_URL: 'http://auth.localhost',
    ...overrides,
  },
});

test('local config keeps Astro env loading and uses the development server', () => {
  const result = checkConfig({}, `
    assert.equal(config.adapter, undefined);
    assert.equal(config.envDir, undefined);
    assert.notEqual(config.vite.envDir, false);
    assert.equal(config.output, 'server');
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('local config rejects split client/server mode and origins at startup', () => {
  for (const overrides of [
    { AUTH_LOCAL_MODE: '0' },
    { PUBLIC_AUTH_LOCAL_MODE: '0' },
    { PUBLIC_AUTH_URL: 'http://auth.localhost:1355' },
  ]) {
    const result = checkConfig(overrides, '');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /matching server and client local mode and origins/);
  }
});

test('production config retains Cloudflare even with local flags present', () => {
  const result = checkConfig({ NODE_ENV: 'production' }, `assert.equal(config.adapter.name, '@astrojs/cloudflare');`);
  assert.equal(result.status, 0, result.stderr);
});
