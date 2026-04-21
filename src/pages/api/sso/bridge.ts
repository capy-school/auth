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

  const tokenRequest = new Request(
    new URL("/api/auth/one-time-token/generate", request.url),
    {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      },
    },
  );

  const tokenResponse = await auth.handler(tokenRequest);
  if (!tokenResponse.ok) return Response.redirect(redirectURL.toString(), 302);

  const tokenData = await tokenResponse.json().catch(() => null);
  const token =
    tokenData && typeof tokenData === "object" && "token" in tokenData
      ? tokenData.token
      : null;

  if (typeof token !== "string" || !token) {
    return Response.redirect(redirectURL.toString(), 302);
  }

  const bridgeURL = new URL(LEGACY_SSO_BRIDGE_URL);
  bridgeURL.searchParams.set("token", token);
  bridgeURL.searchParams.set("redirect", redirectURL.toString());

  return Response.redirect(bridgeURL.toString(), 302);
};
