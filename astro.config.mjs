// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// Build plugins array conditionally
const vitePlugins = [];
if (tailwindcss) {
  vitePlugins.push(tailwindcss());
}

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'server',

  image: {
    remotePatterns: [],
  },

  vite: {
    plugins: vitePlugins,
  },

  adapter: cloudflare(),
});
