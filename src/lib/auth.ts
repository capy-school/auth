import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";

function getEnv(key: string, defaultValue?: string) {
  return import.meta.env[key] || process.env[key] || defaultValue;
}

interface Database {
}

const db = new Kysely<Database>({
    dialect: new LibsqlDialect({
        url: getEnv('TURSO_DATABASE_URL', 'file:local.db'),
        authToken: getEnv('TURSO_AUTH_TOKEN'),
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
      clientId: getEnv('GOOGLE_CLIENT_ID'),
      clientSecret: getEnv('GOOGLE_CLIENT_SECRET'),
    },
    github: {
      clientId: getEnv('GITHUB_CLIENT_ID'),
      clientSecret: getEnv('GITHUB_CLIENT_SECRET'),
    },
    microsoft: { 
        clientId: getEnv('MICROSOFT_CLIENT_ID'), 
        clientSecret: getEnv('MICROSOFT_CLIENT_SECRET'), 
        // Optional
        tenantId: 'common', 
        authority: "https://login.microsoftonline.com", // Authentication authority URL
        prompt: "select_account", // Forces account selection
    }, 
    vk: { 
      clientId: getEnv('VK_CLIENT_ID'), 
      clientSecret: getEnv('VK_CLIENT_SECRET'), 
    },
    kakao: { 
      clientId: getEnv('KAKAO_CLIENT_ID'), 
      clientSecret: getEnv('KAKAO_CLIENT_SECRET'), 
    },
    naver: { 
      clientId: getEnv('NAVER_CLIENT_ID'), 
      clientSecret: getEnv('NAVER_CLIENT_SECRET'), 
    },
    line: { 
      clientId: getEnv('LINE_CLIENT_ID'),
      clientSecret: getEnv('LINE_CLIENT_SECRET'),
      // Optional: override redirect if needed
      // redirectURI: "https://your.app/api/auth/callback/line",
      // scopes are prefilled: ["openid","profile","email"]. Append if needed
    },
  },
  // CORS/trusted origins: local dev + app frontends + Apple (for Sign in with Apple web flow)
  trustedOrigins: [
    "http://localhost:4321",
    "http://localhost:5174",
    "http://localhost:4322",
    "https://capyschool.dev",
    "https://app.capyschool.ai",
    "http://localhost:5175",
    "http://localhost:4330",
    "https://cms-ai.dev",
    "https://cms.ai",
    "https://appleid.apple.com",
  ], 
  secret: getEnv('BETTER_AUTH_SECRET'),
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'qq',
          authorizationUrl: 'https://graph.qq.com/oauth2.0/authorize',
          tokenUrl: 'https://graph.qq.com/oauth2.0/token',
          // QQ requires openid via a separate endpoint; we'll fetch both
          clientId: getEnv('QQ_CLIENT_ID'),
          clientSecret: getEnv('QQ_CLIENT_SECRET'),
          scopes: ['get_user_info'],
          // After token exchange, map to Better Auth user
          getUserInfo: async (tokens: any) => {
            const accessToken = tokens.accessToken as string;
            const appId = getEnv('QQ_CLIENT_ID');
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
