import { createAuthClient } from 'better-auth/client';
import { genericOAuthClient, twoFactorClient, magicLinkClient, passkeyClient, apiKeyClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4321',
  plugins: [
    genericOAuthClient(), 
    twoFactorClient(),
    // phoneNumberClient(),
    magicLinkClient(),
    passkeyClient(), 
    apiKeyClient(), 
    // organizationClient(),
  ],
});
