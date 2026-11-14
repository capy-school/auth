import type { APIRoute } from 'astro';
import { auth } from '../../../../lib/auth';

/**
 * Check organization status for a specific user by ID
 * Requires API key or session authentication
 * API key holder can only view their own status or users in their organizations
 * 
 * GET /api/users/:id/status
 * Headers: X-API-Key or Authorization: Bearer <token> (or user session)
 * 
 * Optional query params:
 * - slug: Filter status for a specific organization
 */

export const GET: APIRoute = async ({ params, request, url }) => {
  try {
    const { id: targetUserId } = params;
    const filterSlug = url.searchParams.get('slug');

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'User ID is required in URL path' 
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

    // Try to get session first
    const session = await auth.api.getSession({ 
      headers: request.headers 
    });

    let currentUserId: string | null = null;
    let authType: 'session' | 'apiKey' = 'session';

    if (session?.user) {
      currentUserId = session.user.id;
    } else {
      // Try API key authentication
      const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Authentication required - Provide session or API key'
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

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

      currentUserId = verificationResult.key.userId;
      authType = 'apiKey';
    }

    // Check if requesting user has permission to view target user's status
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
            error: 'Forbidden - You can only view status of users in your organizations',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build query for target user's organization memberships
    let query = db
      .selectFrom('member')
      .innerJoin('organization', 'organization.id', 'member.organizationId')
      .select([
        'organization.id',
        'organization.name',
        'organization.slug',
        'organization.metadata',
        'member.role',
        'member.createdAt as memberSince',
      ])
      .where('member.userId', '=', targetUserId);

    // Filter by slug if provided
    if (filterSlug) {
      query = query.where('organization.slug', '=', filterSlug);
    }

    const memberships = await query.execute();

    if (memberships.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: filterSlug 
            ? `Organization '${filterSlug}' not found or user not a member`
            : 'User is not a member of any organization',
          userId: targetUserId,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get target user info
    const targetUser = await db
      .selectFrom('user')
      .select(['id', 'name', 'email', 'image'])
      .where('id', '=', targetUserId)
      .executeTakeFirst();

    // Map memberships to status objects
    const organizationStatuses = memberships.map((membership: any) => {
      // Parse metadata to check for payment/consumption settings
      let metadata = null;
      try {
        metadata = membership.metadata ? JSON.parse(membership.metadata) : null;
      } catch (e) {
        metadata = null;
      }

      // Determine consumption status based on organization metadata
      const canConsume = true; // Default: allow consumption
      const paymentStatus = metadata?.paymentStatus || 'active';
      const consumptionLimits = metadata?.consumptionLimits || null;

      return {
        organization: {
          id: membership.id,
          name: membership.name,
          slug: membership.slug,
        },
        membership: {
          role: membership.role,
          memberSince: membership.memberSince,
        },
        status: {
          canConsume,
          paymentStatus,
          consumptionLimits,
          active: paymentStatus === 'active',
        },
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: targetUser?.id,
            name: targetUser?.name,
            email: targetUser?.email,
            image: targetUser?.image,
          },
          organizations: organizationStatuses,
          totalOrganizations: organizationStatuses.length,
          ...(filterSlug && organizationStatuses.length === 1 && {
            // If filtering by slug and found one, include it at root level for convenience
            organization: organizationStatuses[0].organization,
            membership: organizationStatuses[0].membership,
            status: organizationStatuses[0].status,
          }),
        },
        meta: {
          authType,
          requestingUserId: currentUserId,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('User status error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
