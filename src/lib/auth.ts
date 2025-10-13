import { betterAuth } from 'better-auth';
import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";

interface Database {
}

const db = new Kysely<Database>({
    dialect: new LibsqlDialect({
        url: import.meta.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:local.db',
        authToken: import.meta.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
    }),
});

export const auth = betterAuth({
  database: {
    db: db,
    type: 'sqlite',
  },
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      prompt: "select_account", 
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    facebook: { 
      clientId: process.env.FACEBOOK_CLIENT_ID as string, 
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string, 
    }, 
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    apple: { 
        clientId: process.env.APPLE_CLIENT_ID as string, 
        clientSecret: process.env.APPLE_CLIENT_SECRET as string, 
        // Optional
        appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER as string, 
    }, 
    microsoft: { 
        clientId: process.env.MICROSOFT_CLIENT_ID as string, 
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string, 
        // Optional
        tenantId: 'common', 
        authority: "https://login.microsoftonline.com", // Authentication authority URL
        prompt: "select_account", // Forces account selection
    }, 
    vk: { 
      clientId: process.env.VK_CLIENT_ID as string, 
      clientSecret: process.env.VK_CLIENT_SECRET as string, 
    },
    kakao: { 
      clientId: process.env.KAKAO_CLIENT_ID as string, 
      clientSecret: process.env.KAKAO_CLIENT_SECRET as string, 
    },
    naver: { 
      clientId: process.env.NAVER_CLIENT_ID as string, 
      clientSecret: process.env.NAVER_CLIENT_SECRET as string, 
    },
    line: { 
      clientId: process.env.LINE_CLIENT_ID as string,
      clientSecret: process.env.LINE_CLIENT_SECRET as string,
      // Optional: override redirect if needed
      // redirectURI: "https://your.app/api/auth/callback/line",
      // scopes are prefilled: ["openid","profile","email"]. Append if needed
    },
  },
  // Add appleid.apple.com to trustedOrigins for Sign In with Apple flows
  trustedOrigins: ["https://appleid.apple.com"], 
  secret: process.env.BETTER_AUTH_SECRET || 'your-secret-key-must-be-at-least-32-characters-long-for-security',
});
