import { createAuthClient } from "better-auth/client";
import {
  genericOAuthClient,
  twoFactorClient,
  magicLinkClient,
  passkeyClient,
  apiKeyClient,
  organizationClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_AUTH_URL || "http://localhost:4321",
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    genericOAuthClient(),
    twoFactorClient(),
    // phoneNumberClient(),
    magicLinkClient(),
    passkeyClient(),
    apiKeyClient(),
    organizationClient(),
  ],
});
