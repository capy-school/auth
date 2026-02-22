import type { APIRoute } from "astro";
import { auth } from "../../../lib/auth";
import { isSSORedirectAllowed } from "../../../lib/sso";

function resolveCookieDomainFromHost(hostname: string) {
  if (hostname === "capy.town" || hostname.endsWith(".capy.town")) {
    return "capy.town";
  }
  if (hostname === "capyschool.com" || hostname.endsWith(".capyschool.com")) {
    return "capyschool.com";
  }
  return "";
}

function rewriteCookieDomain(setCookie: string, domain: string) {
  // __Host- cookies cannot include Domain attribute by spec.
  if (/^__Host-/i.test(setCookie)) {
    return setCookie;
  }
  if (/;\s*Domain=/i.test(setCookie)) {
    return setCookie.replace(/;\s*Domain=[^;]*/i, `; Domain=${domain}`);
  }
  return `${setCookie}; Domain=${domain}`;
}

export const GET: APIRoute = async ({ request, url }) => {
  const token = url.searchParams.get("token");
  const redirect = url.searchParams.get("redirect");

  if (!token || !redirect) {
    return new Response("Missing token or redirect", { status: 400 });
  }

  let redirectURL: URL;
  try {
    redirectURL = new URL(redirect);
  } catch {
    return new Response("Invalid redirect URL", { status: 400 });
  }

  if (!isSSORedirectAllowed(redirectURL)) {
    return new Response("Redirect URL is not allowed", { status: 400 });
  }

  const verifyRequest = new Request(
    new URL("/api/auth/one-time-token/verify", request.url),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "x-real-ip": request.headers.get("x-real-ip") ?? "",
      },
      body: JSON.stringify({ token }),
    },
  );

  const verifyResponse = await auth.handler(verifyRequest);

  if (!verifyResponse.ok) {
    return new Response("Invalid or expired SSO token", { status: 401 });
  }

  const responseHeaders = new Headers({
    Location: redirectURL.toString(),
    "Cache-Control": "no-store",
  });

  const requestHost = new URL(request.url).hostname;
  const cookieDomain = resolveCookieDomainFromHost(requestHost);

  const maybeGetSetCookie = (
    verifyResponse.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;

  if (typeof maybeGetSetCookie === "function") {
    const cookies = maybeGetSetCookie.call(verifyResponse.headers);
    for (const cookie of cookies) {
      responseHeaders.append(
        "set-cookie",
        cookieDomain ? rewriteCookieDomain(cookie, cookieDomain) : cookie,
      );
    }
  } else {
    const setCookie = verifyResponse.headers.get("set-cookie");
    if (setCookie) {
      responseHeaders.set(
        "set-cookie",
        cookieDomain ? rewriteCookieDomain(setCookie, cookieDomain) : setCookie,
      );
    }
  }

  return new Response(null, {
    status: 302,
    headers: responseHeaders,
  });
};
