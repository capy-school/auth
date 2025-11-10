import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';

/**
 * Get all users related to organizations that the API key holder belongs to
 * Returns paginated list of users, excluding the API key holder
 * Requires API key authentication
 * 
 * GET /api/users
 * Headers: X-API-Key or Authorization: Bearer <token>
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - organizationSlug: Filter by specific organization
 */

export const GET: APIRoute = async ({ request, url }) => {
  try {
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

    // Parse pagination params
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;
    const organizationSlug = url.searchParams.get('organizationSlug');

    // Get organization IDs where the current user is a member
    let orgQuery = db
      .selectFrom('member')
      .select('organizationId')
      .where('userId', '=', currentUserId);

    if (organizationSlug) {
      orgQuery = orgQuery
        .innerJoin('organization', 'organization.id', 'member.organizationId')
        .where('organization.slug', '=', organizationSlug);
    }

    const userOrganizations = await orgQuery.execute();
    const organizationIds = userOrganizations.map((org: any) => org.organizationId);

    if (organizationIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User is not a member of any organization',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get all unique users from these organizations (excluding current user)
    // First, get total count of distinct users
    const distinctUsers = await db
      .selectFrom('member')
      .select('userId')
      .distinct()
      .where('member.organizationId', 'in', organizationIds)
      .where('userId', '!=', currentUserId)
      .execute();

    const totalUsers = distinctUsers.length;
    const totalPages = Math.ceil(totalUsers / limit);

    // Get paginated users with their organization memberships
    const users = await db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .innerJoin('organization', 'organization.id', 'member.organizationId')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.image',
        'user.emailVerified',
        'user.createdAt',
        'member.role',
        'member.createdAt as memberSince',
        'organization.id as organizationId',
        'organization.name as organizationName',
        'organization.slug as organizationSlug',
      ])
      .where('member.organizationId', 'in', organizationIds)
      .where('user.id', '!=', currentUserId)
      .orderBy('user.createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    // Group users and their organizations
    const userMap = new Map();
    users.forEach((row: any) => {
      if (!userMap.has(row.id)) {
        userMap.set(row.id, {
          id: row.id,
          name: row.name,
          email: row.email,
          image: row.image,
          emailVerified: row.emailVerified,
          createdAt: row.createdAt,
          organizations: [],
        });
      }
      
      userMap.get(row.id).organizations.push({
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        organizationSlug: row.organizationSlug,
        role: row.role,
        memberSince: row.memberSince,
      });
    });

    const usersList = Array.from(userMap.values());

    // Build pagination URLs
    const baseUrl = new URL(request.url);
    const buildPageUrl = (pageNum: number) => {
      const newUrl = new URL(baseUrl);
      newUrl.searchParams.set('page', pageNum.toString());
      newUrl.searchParams.set('limit', limit.toString());
      if (organizationSlug) {
        newUrl.searchParams.set('organizationSlug', organizationSlug);
      }
      return newUrl.toString();
    };

    const pagination = {
      page,
      limit,
      total: totalUsers,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      next: page < totalPages ? buildPageUrl(page + 1) : null,
      previous: page > 1 ? buildPageUrl(page - 1) : null,
      first: buildPageUrl(1),
      last: buildPageUrl(totalPages),
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          requestingUser: {
            userId: currentUserId,
            keyId: keyData.id,
            keyName: keyData.name,
          },
          users: usersList,
          pagination,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Users list error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
