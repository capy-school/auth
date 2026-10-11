import { localPolicy } from './local-policy.mjs';

export const localClientPolicy = localPolicy(
  import.meta.env.DEV,
  import.meta.env.PUBLIC_AUTH_LOCAL_MODE,
  import.meta.env.PUBLIC_AUTH_URL,
);
