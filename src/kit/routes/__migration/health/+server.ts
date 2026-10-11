import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(
  { status: 'ok', candidate: 'sveltekit-diagnostic', authentication: false },
  { headers: { 'cache-control': 'no-store' } },
);
