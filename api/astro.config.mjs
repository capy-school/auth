// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { localPolicy } from '../shared/local-policy.mjs';

// https://astro.build/config
const development = process.env.NODE_ENV === 'development';
const environment = fileURLToPath(new URL('../', import.meta.url));
const env = loadEnv(development ? 'development' : 'production', environment, '');
const local = development && env.AUTH_LOCAL_MODE === '1';
if (development && (local || env.PUBLIC_AUTH_LOCAL_MODE === '1')) {
  const server = localPolicy(true, env.AUTH_LOCAL_MODE, env.AUTH_BASE_URL);
  const client = localPolicy(true, env.PUBLIC_AUTH_LOCAL_MODE, env.PUBLIC_AUTH_URL);
  if (!server || client?.authOrigin !== server.authOrigin) {
    throw new Error('Local Auth requires matching server and client local mode and origins');
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: environment,
  output: 'server',

  image: {
    remotePatterns: [],
  },

  vite: {
    ...(local ? { server: { cors: false } } : {}),
  },

  adapter: local ? undefined : cloudflare(),
});
