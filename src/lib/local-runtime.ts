import { localPolicy } from './local-policy.mjs';

// Astro loads the same development env files for the server and client.
export const localAuthPolicy = localPolicy(
  import.meta.env.DEV,
  String(import.meta.env.AUTH_LOCAL_MODE),
  import.meta.env.AUTH_BASE_URL,
);
