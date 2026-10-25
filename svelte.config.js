import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: '.svelte-kit/static',
      assets: '.svelte-kit/static',
      strict: true,
    }),
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
