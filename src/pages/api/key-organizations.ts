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

    const db = auth.options.database?.db as any;
    
    if (!db) {
      return new Response(
        JSON.stringify({ error: 'Database not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify API key and get userId
    const keyData = await db
      .selectFrom('apiKey')
      .select(['id', 'userId', 'name', 'expiresAt'])
      .where('key', '=', apiKey)
      .executeTakeFirst();

    if (!keyData) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if key is expired
    if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'API key has expired' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get all organizations where the user is a member
    const organizationMemberships = await db
      .selectFrom('member')
      .innerJoin('organization', 'organization.id', 'member.organizationId')
      .select([
        'organization.id',
        'organization.name',
        'organization.slug',
        'organization.logo',
        'organization.metadata',
        'organization.createdAt',
        'organization.updatedAt',
        'member.role',
        'member.createdAt as memberSince',
      ])
      .where('member.userId', '=', keyData.userId)
      .execute();

    // Update last used timestamp
    await db
      .updateTable('apiKey')
      .set({ lastUsedAt: new Date().toISOString() })
      .where('id', '=', keyData.id)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          keyId: keyData.id,
          keyName: keyData.name,
          userId: keyData.userId,
          organizations: organizationMemberships.map(org => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            logo: org.logo,
            metadata: org.metadata ? JSON.parse(org.metadata) : null,
            role: org.role,
            memberSince: org.memberSince,
            createdAt: org.createdAt,
            updatedAt: org.updatedAt,
          })),
          totalOrganizations: organizationMemberships.length,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('API key organizations error:', error);
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
