import { createAuthClient } from "better-auth/client";
import {
  genericOAuthClient,
  twoFactorClient,
  magicLinkClient,
  oneTimeTokenClient,
  passkeyClient,
  apiKeyClient,
  organizationClient,
} from "better-auth/client/plugins";

// Automatically detect base URL based on environment
const getBaseURL = () => {
  // In browser, use current origin if on production domain
  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    // If on production domain, use current origin
    if (hostname.includes("capyschool.com") || hostname.includes("capy.town")) {
      return origin;
    }
  }
  // Otherwise use env var or localhost
  return import.meta.env.PUBLIC_AUTH_URL || "http://localhost:4321";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    genericOAuthClient(),
    twoFactorClient(),
    // phoneNumberClient(),
    magicLinkClient(),
    oneTimeTokenClient(),
    passkeyClient(),
    apiKeyClient(),
    organizationClient(),
  ],
});
