import type { APIRoute } from "astro";
import { auth } from "../../lib/auth";

/**
 * Verify if an API key holder can consume resources
 * Hardcoded to only allow consumption for the 'capyschool' organization
 *
 * POST /api/verify-consumption
 * Body: { apiKey: string }
 *
 * GET /api/verify-consumption
 * Headers: X-API-Key or Authorization: Bearer <token>
 */

const ALLOWED_ORGANIZATION_SLUG = "capyschool";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          canConsume: false,
          error: "API key is required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const db = auth.options.database?.db as any;

    if (!db) {
      return new Response(
        JSON.stringify({
          success: false,
          canConsume: false,
          error: "Database not configured",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
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
          canConsume: false,
          error: verificationResult?.error?.message || "Invalid API key",
          reason: "API key verification failed",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const keyData = verificationResult.key;

    // Check if user is a member of the allowed organization
    const membership = await db
      .selectFrom("member")
      .innerJoin("organization", "organization.id", "member.organizationId")
      .select([
        "organization.id",
        "organization.name",
        "organization.slug",
        "member.role",
        "member.createdAt as memberSince",
      ])
      .where("member.userId", "=", keyData.userId)
      .where("organization.slug", "=", ALLOWED_ORGANIZATION_SLUG)
      .executeTakeFirst();

    if (!membership) {
      return new Response(
        JSON.stringify({
          success: false,
          canConsume: false,
          error: "Not authorized to consume resources",
          reason: `User is not a member of the '${ALLOWED_ORGANIZATION_SLUG}' organization`,
          requiredOrganization: ALLOWED_ORGANIZATION_SLUG,
          userId: keyData.userId,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Note: Better Auth's verifyApiKey already updates lastUsedAt automatically

    // User is authorized to consume
    return new Response(
      JSON.stringify({
        success: true,
        canConsume: true,
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
          allowedOrganization: ALLOWED_ORGANIZATION_SLUG,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Consumption verification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        canConsume: false,
        error: "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const GET: APIRoute = async ({ request }) => {
  const apiKey =
    request.headers.get("X-API-Key") ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        canConsume: false,
        error:
          "API key is required in X-API-Key header or Authorization Bearer token",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Reuse POST logic
  return POST({
    request: new Request(request.url, {
      method: "POST",
      body: JSON.stringify({ apiKey }),
      headers: request.headers,
    }),
  } as any);
};
