import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';

/**
 * Get members of an organization by API key
 * User must be a member of the organization to view its members
 * 
 * POST /api/organization-members
 * Body: { apiKey: string, organizationSlug: string }
 * 
 * GET /api/organization-members?organizationSlug=slug
 * Headers: X-API-Key or Authorization: Bearer <token>
 */

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { apiKey, organizationSlug } = body;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'API key is required' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!organizationSlug) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Organization slug is required' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = auth.options.database?.db as any;
    
    if (!db) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Database not configured' 
        }),
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
          error: verificationResult?.error?.message || 'Invalid API key'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const keyData = verificationResult.key;

    // First, verify the user is a member of the organization
    const userMembership = await db
      .selectFrom('member')
      .innerJoin('organization', 'organization.id', 'member.organizationId')
      .select([
        'organization.id',
        'organization.name',
        'organization.slug',
        'member.role as userRole',
      ])
      .where('member.userId', '=', keyData.userId)
      .where('organization.slug', '=', organizationSlug)
      .executeTakeFirst();

    if (!userMembership) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Organization not found or user not authorized',
          details: {
            organizationSlug,
            userId: keyData.userId,
          }
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get all members of the organization
    const members = await db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .select([
        'member.id as memberId',
        'member.userId',
        'member.role',
        'member.createdAt as memberSince',
        'user.id as userId',
        'user.name',
        'user.email',
        'user.image',
        'user.emailVerified',
      ])
      .where('member.organizationId', '=', userMembership.id)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          organization: {
            id: userMembership.id,
            name: userMembership.name,
            slug: userMembership.slug,
          },
          requestingUser: {
            userId: keyData.userId,
            role: userMembership.userRole,
          },
          members: members.map((member: any) => ({
            memberId: member.memberId,
            userId: member.userId,
            role: member.role,
            memberSince: member.memberSince,
            user: {
              id: member.userId,
              name: member.name,
              email: member.email,
              image: member.image,
              emailVerified: member.emailVerified,
            }
          })),
          totalMembers: members.length,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Organization members error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
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
        error: 'API key is required in X-API-Key header or Authorization Bearer token'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!organizationSlug) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'organizationSlug query parameter is required'
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
