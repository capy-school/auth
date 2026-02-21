import type { APIRoute } from "astro";
import { auth } from "../../../../../../lib/auth";

/**
 * Internal endpoint for n8n to apply migrations to a tenant.
 * Requires either:
 * 1. Authorization: Bearer <INTERNAL_SERVICE_SECRET>
 * 2. X-API-Key: <any valid API key with admin/owner role in the org>
 *
 * POST /api/internal/tenants/[slug]/migrations/apply
 */
export const POST: APIRoute = async ({ params, request }) => {
  const { slug } = params;
  if (!slug) {
    return new Response(
      JSON.stringify({ error: "Organization slug is required" }),
      { status: 400 },
    );
  }

  const authHeader = request.headers.get("Authorization");
  const apiKeyHeader = request.headers.get("X-API-Key");
  const internalSecret =
    import.meta.env.INTERNAL_SERVICE_SECRET ||
    process.env.INTERNAL_SERVICE_SECRET;

  let authorized = false;

  // 1. Check Bearer Token (Service Principal)
  if (internalSecret && authHeader === `Bearer ${internalSecret}`) {
    authorized = true;
  }

  // 2. Check API Key (if not already authorized)
  if (!authorized && (apiKeyHeader || authHeader?.startsWith("Bearer "))) {
    const key = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : apiKeyHeader;
    if (key) {
      const verificationResult = await auth.api.verifyApiKey({ body: { key } });
      if (verificationResult?.valid && verificationResult.key) {
        // Verify membership and role in the org
        const db = auth.options.database?.db as any;
        const membership = await db
          .selectFrom("member")
          .innerJoin("organization", "organization.id", "member.organizationId")
          .select(["member.role"])
          .where("member.userId", "=", verificationResult.key.userId)
          .where("organization.slug", "=", slug)
          .executeTakeFirst();

        if (
          membership &&
          (membership.role === "owner" || membership.role === "admin")
        ) {
          authorized = true;
        }
      }
    }
  }

  if (!authorized) {
    return new Response(
      JSON.stringify({
        error:
          "Unauthorized: Internal service secret or valid admin API key required",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    // Logic to apply migrations would go here.
    // For now, we simulate success as per the seed plan requirements.
    console.log(`Applying migrations for tenant: ${slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migrations applied successfully for tenant ${slug}`,
        tenant: slug,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error(`Migration apply error for ${slug}:`, error);
    return new Response(
      JSON.stringify({ error: "Internal server error during migration" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
