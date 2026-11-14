import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { kitProxyServer } from './scripts/kit-proxy.mjs';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, 'config/frontend', ['API_UPSTREAM', 'PUBLIC_KIT_']);
  const upstream = process.env.API_UPSTREAM ?? env.API_UPSTREAM;
  const localInbox = command === 'serve' && mode === 'development'
    && (process.env.PUBLIC_KIT_AUTH_LOCAL_MODE ?? env.PUBLIC_KIT_AUTH_LOCAL_MODE) === '1';
  return {
    plugins: [tailwindcss(), sveltekit()],
    envDir: 'config/frontend',
    // Kit's publicPrefix governs $env; import.meta.env needs the same explicit
    // Vite prefix for the development-only local policy flag.
    envPrefix: 'PUBLIC_KIT_',
    server: {
      ...kitProxyServer(upstream, localInbox),
      fs: {
        // SvelteKit supplies src/lib/routes/runtime; only pure shared policy is
        // added. The API, repository root and server environment remain denied.
        allow: ['shared', 'src/styles'],
      },
    },
  };
});
