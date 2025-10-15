// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

import vercel from '@astrojs/vercel';

// Resolve site for Astro config (fixes validation issues in some builds)
const SITE = process.env.AUTH_BASE_URL || process.env.BETTER_AUTH_URL || 'http://localhost:4321';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'server',
  site: SITE,

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: vercel(),
});