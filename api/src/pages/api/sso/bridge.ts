import type { APIRoute } from "astro";
import { auth } from "../../../lib/auth";
import { isSSORedirectAllowed, LEGACY_SSO_BRIDGE_URL } from "../../../lib/sso";
import { localAuthPolicy } from '../../../lib/local-runtime';

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
    if (localAuthPolicy) return new Response('Unable to create local SSO token', { status: 502 });
    return Response.redirect(redirectURL.toString(), 302);
  }

  const bridgeURL = new URL(localAuthPolicy ? '/api/local-auth/complete' : LEGACY_SSO_BRIDGE_URL, redirectURL.origin);
  bridgeURL.searchParams.set("token", token);
  bridgeURL.searchParams.set("redirect", redirectURL.toString());

  return new Response(null, { status: 302, headers: {
    Location: bridgeURL.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  } });
};
