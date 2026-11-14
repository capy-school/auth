import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({ pages: '.svelte-kit/static', assets: '.svelte-kit/static', strict: true }),
    files: { assets: 'static' },
    env: { dir: 'config/frontend', publicPrefix: 'PUBLIC_KIT_', privatePrefix: 'KIT_' },
  },
};
