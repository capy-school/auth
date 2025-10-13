import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';

// Keep this list in sync with trustedOrigins in src/lib/auth.ts
const ALLOWED_ORIGINS = new Set([
  'http://localhost:4321',
  'http://localhost:5174',
  'http://localhost:4322',
  'https://capyschool.dev',
  'https://app.capyschool.ai',
  'http://localhost:5175',
  'http://localhost:4330',
  'https://cms-ai.dev',
  'https://cms.ai',
]);

export const ALL: APIRoute = async (context) => {
  const req = context.request;
  const origin = req.headers.get('origin') || '';
  const isAllowed = origin && ALLOWED_ORIGINS.has(origin);

  if (req.method === 'OPTIONS') {
    // Preflight
    const headers = new Headers();
    if (isAllowed) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Vary', 'Origin');
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
    headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    return new Response(null, { status: 204, headers });
  }

  const res = await auth.handler(req);
  if (!isAllowed) return res;

  // Attach CORS headers to regular responses
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Credentials', 'true');
  return new Response(res.body, { status: res.status, headers });
};
