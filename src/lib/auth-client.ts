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

// Browsers always reach the API through their own origin (Astro or the static
// frontend's /api proxy). Prerendering imports the client but makes no request.
const getBaseURL = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return undefined;
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
