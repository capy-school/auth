import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';

/**
 * Check organization status and consumption authorization for API key holder
 * Returns status for all organizations the user belongs to
 * 
 * GET /api/organizations/status
 * Headers: X-API-Key or Authorization: Bearer <token>
 * 
 * Optional query params:
 * - slug: Filter status for a specific organization
 */

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
    const filterSlug = url.searchParams.get('slug');

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

    // Build query for organization memberships
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
      .where('member.userId', '=', keyData.userId);

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
            ? `Organization '${filterSlug}' not found or user not authorized`
            : 'User is not a member of any organization',
          userId: keyData.userId,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
      // You can customize this logic based on your business rules
      const canConsume = true; // Default: allow consumption
      const paymentStatus = metadata?.paymentStatus || 'active'; // active, suspended, trial, etc.
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
          keyId: keyData.id,
          keyName: keyData.name,
          userId: keyData.userId,
          organizations: organizationStatuses,
          totalOrganizations: organizationStatuses.length,
          ...(filterSlug && organizationStatuses.length === 1 && {
            // If filtering by slug and found one, include it at root level for convenience
            organization: organizationStatuses[0].organization,
            membership: organizationStatuses[0].membership,
            status: organizationStatuses[0].status,
          }),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Organization status error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
