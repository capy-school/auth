import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';

/**
 * Get all organizations that the authenticated principal belongs to
 * Supports both Session (Cookie) and Bearer/API-Key (Authorization header)
 * 
 * GET /api/auth/organizations
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // 1. Try to get session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    let userId: string | null = null;

    if (session?.user) {
      userId = session.user.id;
    } else {
      // 2. Try API Key / Bearer Token
      const authHeader = request.headers.get('Authorization');
      const apiKeyHeader = request.headers.get('X-API-Key');
      const key = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : apiKeyHeader;

      if (key) {
        const verificationResult = await auth.api.verifyApiKey({
          body: { key },
        });
        if (verificationResult?.valid && verificationResult.key) {
          userId = verificationResult.key.userId;
        }
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Unauthorized' 
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
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

    // Get all organizations where the user is a member
    const memberships = await db
      .selectFrom('member')
      .innerJoin('organization', 'organization.id', 'member.organizationId')
      .select([
        'organization.id',
        'organization.name',
        'organization.slug',
        'organization.logo',
        'organization.metadata',
        'member.role',
        'member.createdAt as memberSince',
      ])
      .where('member.userId', '=', userId)
      .execute();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          userId,
          organizations: memberships.map((org: any) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            logo: org.logo,
            metadata: org.metadata ? JSON.parse(org.metadata) : null,
            role: org.role,
            memberSince: org.memberSince,
          })),
          total: memberships.length,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('API /api/auth/organizations error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
