import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => json({
  kind: 'static-build',
  candidate: 'sveltekit-static-diagnostic',
  authentication: false,
});
