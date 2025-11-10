import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';

/**
 * Verify if an API key has access to a specific organization by slug
 * 
 * POST /api/verify-organization
 * Body: { apiKey: string, organizationSlug: string }
 * 
 * GET /api/verify-organization?organizationSlug=slug
 * Headers: X-API-Key or Authorization: Bearer <token>
 */

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { apiKey, organizationSlug } = body;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!organizationSlug) {
      return new Response(
        JSON.stringify({ error: 'Organization slug is required' }),
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

    // Verify API key using Better Auth's verifyApiKey method
    const verificationResult = await auth.api.verifyApiKey({
      body: {
        key: apiKey,
      },
    });

    if (!verificationResult || !verificationResult.valid || !verificationResult.key) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: verificationResult?.error?.message || 'Invalid API key',
          authorized: false 
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const keyData = verificationResult.key;

    // Find organization by slug and check if user is a member
    const organizationMembership = await db
      .selectFrom('member')
      .innerJoin('organization', 'organization.id', 'member.organizationId')
      .select([
        'organization.id',
        'organization.name',
        'organization.slug',
        'organization.logo',
        'organization.metadata',
        'organization.createdAt',
        'member.role',
        'member.createdAt as memberSince',
      ])
      .where('member.userId', '=', keyData.userId)
      .where('organization.slug', '=', organizationSlug)
      .executeTakeFirst();

    if (!organizationMembership) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Organization not found or user not authorized',
          authorized: false,
          details: {
            organizationSlug,
            userId: keyData.userId,
          }
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Note: Better Auth's verifyApiKey already updates lastUsedAt automatically

    return new Response(
      JSON.stringify({
        success: true,
        authorized: true,
        data: {
          keyId: keyData.id,
          keyName: keyData.name,
          userId: keyData.userId,
          organization: {
            id: organizationMembership.id,
            name: organizationMembership.name,
            slug: organizationMembership.slug,
            logo: organizationMembership.logo,
            metadata: organizationMembership.metadata 
              ? JSON.parse(organizationMembership.metadata) 
              : null,
            createdAt: organizationMembership.createdAt,
          },
          membership: {
            role: organizationMembership.role,
            memberSince: organizationMembership.memberSince,
          }
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Organization verification error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        authorized: false 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  const organizationSlug = url.searchParams.get('organizationSlug');

  if (!apiKey) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'API key is required in X-API-Key header or Authorization Bearer token',
        authorized: false 
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!organizationSlug) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'organizationSlug query parameter is required',
        authorized: false 
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Reuse POST logic
  return POST({ 
    request: new Request(request.url, {
      method: 'POST',
      body: JSON.stringify({ apiKey, organizationSlug }),
      headers: request.headers,
    }) 
  } as any);
};
