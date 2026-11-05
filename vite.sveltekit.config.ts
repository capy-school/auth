import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { kitProxyServer } from './scripts/kit-proxy.mjs';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, 'src/kit', ['API_UPSTREAM', 'PUBLIC_KIT_']);
  const upstream = process.env.API_UPSTREAM ?? env.API_UPSTREAM;
  const localInbox = command === 'serve' && mode === 'development'
    && (process.env.PUBLIC_KIT_AUTH_LOCAL_MODE ?? env.PUBLIC_KIT_AUTH_LOCAL_MODE) === '1';
  return {
    plugins: [tailwindcss(), sveltekit()],
    envDir: 'src/kit',
    // Kit's publicPrefix governs $env; import.meta.env needs the same explicit
    // Vite prefix for the development-only local policy flag.
    envPrefix: 'PUBLIC_KIT_',
    server: {
      ...kitProxyServer(upstream, localInbox, process.env.KIT_DIAGNOSTICS === '1'),
      fs: {
        // Only public client helpers/controllers are shared; never allow src/lib
        // wholesale, where authentication factories and database access live.
        allow: [
          'src/styles',
          ...['types', 'ui', 'sessions', 'passkeys', 'api-keys', 'two-factor', 'organizations']
            .map(name => `src/components/account/${name}.ts`),
          'src/lib/auth-client.ts', 'src/lib/apps.ts',
          'src/lib/local-client.ts', 'src/lib/local-policy.mjs',
        ],
      },
    },
  };
});
