import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';
import type { Database } from '../../db/schema';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify API key and get associated user/organization info
    // Better Auth stores the key with userId
    const db = auth.options.database?.db as any;
    
    if (!db) {
      return new Response(
        JSON.stringify({ error: 'Database not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify API key using Better Auth's verifyApiKey method
    const verificationResult = await auth.api.verifyApiKey({
      body: {
        key: apiKey,
      },
    });

    if (!verificationResult || !verificationResult.valid || !verificationResult.key) {
      return new Response(
        JSON.stringify({ 
          error: verificationResult?.error?.message || 'Invalid API key'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const keyData = verificationResult.key;

    // Get user info
    const user = await db
      .selectFrom('user')
      .select(['id', 'email', 'name', 'role'])
      .where('id', '=', keyData.userId)
      .executeTakeFirst();

    // Note: Better Auth's verifyApiKey already updates lastUsedAt automatically

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          keyId: keyData.id,
          keyName: keyData.name,
          userId: keyData.userId,
          user: {
            id: user?.id,
            email: user?.email,
            name: user?.name,
            role: user?.role,
          },
          createdAt: keyData.createdAt,
          expiresAt: keyData.expiresAt,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('API key verification error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GET: APIRoute = async ({ request }) => {
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key is required in X-API-Key header or Authorization Bearer token' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Reuse POST logic
  return POST({ request: new Request(request.url, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
    headers: request.headers,
  }) } as any);
};
