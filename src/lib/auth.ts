import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
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
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
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
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'qq',
          authorizationUrl: 'https://graph.qq.com/oauth2.0/authorize',
          tokenUrl: 'https://graph.qq.com/oauth2.0/token',
          // QQ requires openid via a separate endpoint; we'll fetch both
          clientId: process.env.QQ_CLIENT_ID as string,
          clientSecret: process.env.QQ_CLIENT_SECRET as string,
          scopes: ['get_user_info'],
          // After token exchange, map to Better Auth user
          getUserInfo: async (tokens: any) => {
            const accessToken = tokens.accessToken as string;
            const appId = process.env.QQ_CLIENT_ID as string;
            // 1) Get openid
            const meRes = await fetch(`https://graph.qq.com/oauth2.0/me?access_token=${encodeURIComponent(accessToken)}&fmt=json`);
            const meJson = await meRes.json();
            const openid = meJson.openid as string;
            if (!openid) return null;
            // 2) Get profile
            const infoUrl = `https://graph.qq.com/user/get_user_info?access_token=${encodeURIComponent(accessToken)}&oauth_consumer_key=${encodeURIComponent(appId)}&openid=${encodeURIComponent(openid)}&fmt=json`;
            const infoRes = await fetch(infoUrl);
            const info = await infoRes.json();
            const name = info.nickname || 'QQ User';
            const image = info.figureurl_qq_2 || info.figureurl_qq_1 || undefined;
            // QQ may not provide email. Use stable alias to satisfy schema.
            const email = `${openid}@qq.local`;
            return { id: openid, name, email, image } as any;
          },
        },
      ],
    }),
  ],
});
