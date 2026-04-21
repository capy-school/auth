import type { APIRoute } from "astro";
import { serializeCookie, serializeSignedCookie } from "better-call";
import { setSessionCookie } from "better-auth/cookies";
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

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(body ? JSON.stringify(body) : null, {
    status: init?.status,
    headers: {
      "content-type": "application/json",
      ...(init?.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : init?.headers ?? {}),
    },
  });
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

  let verifiedSession:
    | Awaited<ReturnType<typeof auth.api.verifyOneTimeToken>>
    | null = null;

  try {
    verifiedSession = await auth.api.verifyOneTimeToken({
      body: { token },
      headers: request.headers,
    });
  } catch {
    verifiedSession = null;
  }

  if (!verifiedSession) {
    return new Response("Invalid or expired SSO token", { status: 401 });
  }

  const responseHeaders = new Headers({
    Location: redirectURL.toString(),
    "Cache-Control": "no-store",
  });

  const requestHost = new URL(request.url).hostname;
  const cookieDomain = resolveCookieDomainFromHost(requestHost);

  const authContext = await auth.$context;
  const authCookies = {
    ...authContext.authCookies,
    sessionToken: {
      ...authContext.authCookies.sessionToken,
      options: {
        ...authContext.authCookies.sessionToken.options,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
    sessionData: {
      ...authContext.authCookies.sessionData,
      options: {
        ...authContext.authCookies.sessionData.options,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
    dontRememberToken: {
      ...authContext.authCookies.dontRememberToken,
      options: {
        ...authContext.authCookies.dontRememberToken.options,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
  };

  const setCookie = (key: string, value: string, options?: Parameters<typeof serializeCookie>[2]) => {
    const cookie = serializeCookie(key, value, options);
    responseHeaders.append(
      "set-cookie",
      cookieDomain ? rewriteCookieDomain(cookie, cookieDomain) : cookie,
    );
    return cookie;
  };

  const setSigned = async (
    key: string,
    value: string,
    secret: string,
    options?: Parameters<typeof serializeSignedCookie>[3],
  ) => {
    const cookie = await serializeSignedCookie(key, value, secret, options);
    responseHeaders.append(
      "set-cookie",
      cookieDomain ? rewriteCookieDomain(cookie, cookieDomain) : cookie,
    );
    return cookie;
  };

  await setSessionCookie(
    {
      method: request.method,
      path: url.pathname,
      body: undefined,
      query: Object.fromEntries(url.searchParams.entries()),
      params: {},
      request,
      headers: request.headers,
      setHeader(key: string, value: string) {
        responseHeaders.set(key, value);
      },
      getHeader(key: string) {
        return request.headers.get(key);
      },
      getCookie(key: string) {
        const cookieHeader = request.headers.get("cookie") ?? "";
        const cookies = new Map(
          cookieHeader
            .split(/;\s*/)
            .filter(Boolean)
            .map((entry) => {
              const index = entry.indexOf("=");
              return index === -1
                ? [entry, ""]
                : [entry.slice(0, index), entry.slice(index + 1)];
            }),
        );
        return cookies.get(key) ?? null;
      },
      async getSignedCookie() {
        return null;
      },
      setCookie,
      setSignedCookie: setSigned,
      json: jsonResponse,
      redirect(destination: string) {
        return new Response(null, {
          status: 302,
          headers: { Location: destination },
        }) as never;
      },
      error(status: number, body?: { message?: string }) {
        return new Response(body?.message ?? "Request failed", {
          status,
        }) as never;
      },
      context: {
        ...authContext,
        authCookies,
      },
    } as unknown as Parameters<typeof setSessionCookie>[0],
    verifiedSession,
  );

  return new Response(null, {
    status: 302,
    headers: responseHeaders,
  });
};
