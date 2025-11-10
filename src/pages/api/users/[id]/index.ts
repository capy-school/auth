import type { APIRoute } from 'astro';
import { auth } from '../../../../lib/auth';

/**
 * Get detailed information about a specific user by ID
 * Can only view users that belong to the same organizations
 * Requires API key authentication
 * 
 * GET /api/users/:id
 * Headers: X-API-Key or Authorization: Bearer <token>
 */

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { id: targetUserId } = params;

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'User ID is required in URL path' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
    const currentUserId = keyData.userId;

    // Check if requesting user has permission to view target user
    // Permission granted if: same user OR both are members of at least one common organization
    if (currentUserId !== targetUserId) {
      const commonOrgs = await db
        .selectFrom('member as m1')
        .innerJoin('member as m2', 'm1.organizationId', 'm2.organizationId')
        .select('m1.organizationId')
        .where('m1.userId', '=', currentUserId)
        .where('m2.userId', '=', targetUserId)
        .limit(1)
        .execute();

      if (commonOrgs.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Forbidden - You can only view users in your organizations',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get target user details
    const user = await db
      .selectFrom('user')
      .select([
        'id',
        'name',
        'email',
        'image',
        'emailVerified',
        'createdAt',
        'updatedAt',
      ])
      .where('id', '=', targetUserId)
      .executeTakeFirst();

    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User not found',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user's organization memberships
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
        'member.role',
        'member.createdAt as memberSince',
      ])
      .where('member.userId', '=', targetUserId)
      .execute();

    // Get user's sessions count (optional - shows if user is active)
    const sessionsCount = await db
      .selectFrom('session')
      .select(({ fn }: any) => [
        fn.count('id').as('total')
      ])
      .where('userId', '=', targetUserId)
      .where('expiresAt', '>', new Date().toISOString())
      .executeTakeFirst();

    // Get user's API keys count
    const apiKeysCount = await db
      .selectFrom('apiKey')
      .select(({ fn }: any) => [
        fn.count('id').as('total')
      ])
      .where('userId', '=', targetUserId)
      .executeTakeFirst();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          organizations: organizationMemberships.map((org: any) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            logo: org.logo,
            metadata: org.metadata ? JSON.parse(org.metadata) : null,
            role: org.role,
            memberSince: org.memberSince,
            createdAt: org.createdAt,
          })),
          stats: {
            totalOrganizations: organizationMemberships.length,
            activeSessions: parseInt(sessionsCount?.total || '0'),
            apiKeys: parseInt(apiKeysCount?.total || '0'),
          },
        },
        meta: {
          requestingUserId: currentUserId,
          keyId: keyData.id,
          keyName: keyData.name,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('User detail error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
