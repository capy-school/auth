import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: {
      ...adapter({ config: 'wrangler.sveltekit.jsonc' }),
      // Diagnostic routes need no bindings; avoid loading root development secrets.
      emulate: undefined,
    },
    files: {
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
    },
    outDir: '.svelte-kit',
    env: {
      dir: 'src/kit',
      publicPrefix: 'PUBLIC_KIT_',
      privatePrefix: 'KIT_',
    },
  },
};

export default config;
