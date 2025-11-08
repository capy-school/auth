import { getAuth } from "./lib/auth";

export type HonoContext = { Bindings: Env; Variables: AppContext };

export interface Env {
  // Database
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN?: string;

  // better auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_BASE_URL: string;

  // passkey
  PASSKEY_RP_ID: string;
  PASSKEY_RP_NAME: string;

  // API Configuration
  API_BASE_URL?: string;
  CORS_ORIGINS?: string;
}

export interface AppContext {
  auth: ReturnType<typeof getAuth>;
  env: Env;
  user?: {
    id: string;
    externalId: string;
  };
  organization?: {
    id: string;
    externalId: string;
  };
}

