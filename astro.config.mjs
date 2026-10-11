// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { localPolicy } from './src/lib/local-policy.mjs';

// Build plugins array conditionally
const vitePlugins = [];
if (tailwindcss) {
  vitePlugins.push(tailwindcss());
}

// https://astro.build/config
const development = process.env.NODE_ENV === 'development';
const env = loadEnv(development ? 'development' : 'production', fileURLToPath(new URL('.', import.meta.url)), '');
const local = development && env.AUTH_LOCAL_MODE === '1';
if (development && (local || env.PUBLIC_AUTH_LOCAL_MODE === '1')) {
  const server = localPolicy(true, env.AUTH_LOCAL_MODE, env.AUTH_BASE_URL);
  const client = localPolicy(true, env.PUBLIC_AUTH_LOCAL_MODE, env.PUBLIC_AUTH_URL);
  if (!server || client?.authOrigin !== server.authOrigin) {
    throw new Error('Local Auth requires matching server and client local mode and origins');
  }
}

export default defineConfig({
  integrations: [react()],
  output: 'server',

  image: {
    remotePatterns: [],
  },

  vite: {
    ...(local ? { server: { cors: false } } : {}),
    plugins: vitePlugins,
  },

  adapter: local ? undefined : cloudflare(),
});
