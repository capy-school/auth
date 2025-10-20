import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';

const NODE_ENV = import.meta.env.NODE_ENV || process.env.NODE_ENV;

const ALLOWED_ORIGINS = new Set([
  'https://auth.capyschool.com',
  'https://capyschool.com',
  'https://www.capyschool.com',
  'https://cms.capyschool.com',
]);

if (NODE_ENV === 'development') {
  ALLOWED_ORIGINS.add('http://localhost:4321');
}

function corsHeaders(origin: string) {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  return headers;
}

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin') || '';
  const headers = corsHeaders(origin);
  headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  return new Response(null, { status: 204, headers });
};

export const GET: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin') || '';
  const session = await auth.api.getSession({ headers: request.headers });

  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json');

  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  return new Response(JSON.stringify(session), { status: 200, headers });
};
