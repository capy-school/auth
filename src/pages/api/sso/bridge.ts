import type { APIRoute } from "astro";
import { auth } from "../../../lib/auth";
import { isSSORedirectAllowed, LEGACY_SSO_BRIDGE_URL } from "../../../lib/sso";

export const GET: APIRoute = async ({ request, url }) => {
  const home = new URL("/", request.url).toString();
  const redirect = url.searchParams.get("redirect");

  if (!redirect) return Response.redirect(home, 302);

  let redirectURL: URL;
  try {
    redirectURL = new URL(redirect);
  } catch {
    return Response.redirect(home, 302);
  }

  if (!isSSORedirectAllowed(redirectURL)) return Response.redirect(home, 302);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.redirect(home, 302);

  let token: string | null = null;
  try {
    const result = await auth.api.generateOneTimeToken({
      headers: request.headers,
    });
    token = result?.token ?? null;
  } catch {
    token = null;
  }

  if (typeof token !== "string" || token.length === 0) {
    return Response.redirect(redirectURL.toString(), 302);
  }

  const bridgeURL = new URL(LEGACY_SSO_BRIDGE_URL);
  bridgeURL.searchParams.set("token", token);
  bridgeURL.searchParams.set("redirect", redirectURL.toString());

  return Response.redirect(bridgeURL.toString(), 302);
};
