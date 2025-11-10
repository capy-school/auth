import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';

/**
 * Get all organizations that the API key holder belongs to
 * 
 * GET /api/organizations
 * Headers: X-API-Key or Authorization: Bearer <token>
 */

export const GET: APIRoute = async ({ request }) => {
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
        'member.role',
        'member.createdAt as memberSince',
      ])
      .where('member.userId', '=', keyData.userId)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          keyId: keyData.id,
          keyName: keyData.name,
          userId: keyData.userId,
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
          totalOrganizations: organizationMemberships.length,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('API organizations error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
