import { auth } from "./auth";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "owner" | "admin" | "member";
  slug: string;
}

/**
 * Validates that the request is authenticated and the user is a member of the specified organization slug.
 * Supports Session, Bearer Token, and API Key.
 */
export async function validateOrgAccess(request: Request, slug: string): Promise<AuthContext | Response> {
  if (!slug) {
    return new Response(JSON.stringify({ error: "Organization slug is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Identify User (Session or API Key)
  let userId: string | null = null;
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user) {
    userId = session.user.id;
  } else {
    const authHeader = request.headers.get("Authorization");
    const apiKeyHeader = request.headers.get("X-API-Key");
    const key = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : apiKeyHeader;

    if (key) {
      const verificationResult = await auth.api.verifyApiKey({ body: { key } });
      if (verificationResult?.valid && verificationResult.key) {
        userId = verificationResult.key.userId;
      }
    }
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Verify Membership and Fetch Org Details
  const db = auth.options.database?.db as any;
  if (!db) {
    return new Response(JSON.stringify({ error: "Database not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const membership = await db
    .selectFrom("member")
    .innerJoin("organization", "organization.id", "member.organizationId")
    .select(["member.organizationId", "member.role", "organization.slug"])
    .where("member.userId", "=", userId)
    .where("organization.slug", "=", slug)
    .executeTakeFirst();

  if (!membership) {
    return new Response(JSON.stringify({ error: `Forbidden: Not a member of organization '${slug}'` }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    slug: membership.slug,
  };
}
