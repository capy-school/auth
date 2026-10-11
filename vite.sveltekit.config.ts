import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  envDir: 'src/kit',
  server: {
    fs: {
      // Vite concatenates this addition with SvelteKit's generated allowlist.
      allow: ['src/styles'],
    },
  },
});
