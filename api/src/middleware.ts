import { defineMiddleware } from "astro:middleware";

const MAIN_AUTH_ORIGIN = "https://auth.capy.town";
const LEGACY_AUTH_HOST = "auth.capyschool.com";
const SSO_BRIDGE_PATH = "/api/sso/complete";

export const onRequest = defineMiddleware(async ({ url }, next) => {
  if (
    url.hostname === LEGACY_AUTH_HOST &&
    !url.pathname.startsWith(SSO_BRIDGE_PATH)
  ) {
    const destination = new URL(`${url.pathname}${url.search}`, MAIN_AUTH_ORIGIN);
    return Response.redirect(destination.toString(), 307);
  }

  return next();
});
