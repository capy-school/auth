import type { APIRoute } from 'astro';
import { auth } from '../../../../lib/auth';

/**
 * Get detailed information about a specific organization by slug
 * User must be a member of the organization to view its details
 * Requires API key authentication
 * 
 * GET /api/organizations/:slug
 * Headers: X-API-Key or Authorization: Bearer <token>
 */

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Organization slug is required in URL path' 
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

    // Get organization details and verify user membership
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
      .where('organization.slug', '=', slug)
      .executeTakeFirst();

    if (!organizationMembership) {
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

    // Get total member count for this organization
    const memberCount = await db
      .selectFrom('member')
      .select(({ fn }: any) => [
        fn.count('id').as('total')
      ])
      .where('organizationId', '=', organizationMembership.id)
      .executeTakeFirst();

    // Parse metadata
    let metadata = null;
    try {
      metadata = organizationMembership.metadata ? JSON.parse(organizationMembership.metadata) : null;
    } catch (e) {
      metadata = null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          keyId: keyData.id,
          keyName: keyData.name,
          userId: keyData.userId,
          organization: {
            id: organizationMembership.id,
            name: organizationMembership.name,
            slug: organizationMembership.slug,
            logo: organizationMembership.logo,
            metadata,
            createdAt: organizationMembership.createdAt,
          },
          membership: {
            role: organizationMembership.role,
            memberSince: organizationMembership.memberSince,
          },
          stats: {
            totalMembers: parseInt(memberCount?.total || '0'),
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Organization detail error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
