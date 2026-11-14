/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly TURSO_DATABASE_URL: string;
  readonly TURSO_AUTH_TOKEN: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly AUTH_BASE_URL?: string;
  readonly FORWARDEMAIL_KEY?: string;
  readonly SMTP_FROM?: string;
  readonly EMAIL_FROM?: string;
  readonly PASSKEY_RP_ID?: string;
  readonly PASSKEY_RP_NAME?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly FACEBOOK_CLIENT_ID?: string;
  readonly FACEBOOK_CLIENT_SECRET?: string;
  readonly APPLE_CLIENT_ID?: string;
  readonly APPLE_CLIENT_SECRET?: string;
  readonly MICROSOFT_CLIENT_ID?: string;
  readonly MICROSOFT_CLIENT_SECRET?: string;
  readonly KAKAO_CLIENT_ID?: string;
  readonly KAKAO_CLIENT_SECRET?: string;
  readonly NAVER_CLIENT_ID?: string;
  readonly NAVER_CLIENT_SECRET?: string;
  readonly LINE_CLIENT_ID?: string;
  readonly LINE_CLIENT_SECRET?: string;
  readonly ADMIN_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
