import type { APIRoute } from 'astro';
import { auth } from '../../../../lib/auth';

/**
 * Get members of an organization by slug using API key
 * 
 * GET /api/organization/:slug/members
 * Headers: X-API-Key or Authorization: Bearer <token>
 */

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'API key is required in X-API-Key header or Authorization Bearer token' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!slug) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Organization slug is required in URL path' 
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
      .where('organization.slug', '=', slug)
      .executeTakeFirst();

    if (!userMembership) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Organization not found or user not authorized',
          details: {
            organizationSlug: slug,
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
