import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const prerender = true;

export const GET: RequestHandler = () => json({
  kind: 'static-build',
  candidate: 'sveltekit-static-diagnostic',
  authentication: false,
});
