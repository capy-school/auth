import type { APIRoute } from 'astro';
import { auth } from '../../../../lib/auth';

/**
 * Check organization status and consumption authorization for a specific organization
 * Requires API key authentication
 * 
 * GET /api/organizations/:slug/status
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

    // Get organization membership for the specific slug
    const membership = await db
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
      .where('member.userId', '=', keyData.userId)
      .where('organization.slug', '=', slug)
      .executeTakeFirst();

    if (!membership) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Organization '${slug}' not found or user not authorized`,
          userId: keyData.userId,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          keyId: keyData.id,
          keyName: keyData.name,
          userId: keyData.userId,
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
