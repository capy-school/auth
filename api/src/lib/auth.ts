import { betterAuth } from 'better-auth';
import { apiKey, magicLink, oAuthProxy, twoFactor } from 'better-auth/plugins';
import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { passkey } from 'better-auth/plugins/passkey';
import { sendEmail } from './email';

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
      // Ensure provider redirects back to the correct domain
      redirectURI: `${getEnv('AUTH_BASE_URL', 'http://localhost:4321')}/api/auth/callback/google`,
    },
    github: {
      clientId: getEnv('GITHUB_CLIENT_ID'),
      clientSecret: getEnv('GITHUB_CLIENT_SECRET'),
      // Ensure provider redirects back to the correct domain
      redirectURI: `${getEnv('AUTH_BASE_URL', 'http://localhost:4321')}/api/auth/callback/github`,
    },
    microsoft: { 
        clientId: getEnv('MICROSOFT_CLIENT_ID'), 
        clientSecret: getEnv('MICROSOFT_CLIENT_SECRET'), 
        // Optional
        tenantId: 'common', 
        authority: "https://login.microsoftonline.com", // Authentication authority URL
        prompt: "select_account", // Forces account selection
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
  advanced: {
    crossSubDomainCookies: {
        enabled: true,
        domain: "capyschool.com", // your domain
    },
  },
  // CORS/trusted origins: local dev + app frontends + Apple (for Sign in with Apple web flow)
  trustedOrigins: [
    "https://auth.capyschool.com",
    "https://capyschool.com",
    "https://www.capyschool.com",
    "https://cms.capyschool.com",
    // local dev
    "http://localhost:4321",
  ], 
  secret: getEnv('BETTER_AUTH_SECRET'),
  plugins: [
    twoFactor(),
    //   phoneNumber({  
    //     sendOTP: ({ phoneNumber, code }, request) => { 
    //         // Implement sending OTP code via SMS
    //     } 
    // }),
    magicLink({
      sendMagicLink: async ({ email, token, url }, request) => {
          const appBase = getEnv('AUTH_BASE_URL', 'http://localhost:4321').replace(/\/+$/,'');
          const signInUrl = url || `${appBase}/api/auth/magic-link?token=${encodeURIComponent(token)}`;
          const callbackURL = `${appBase}/`;
          const html = `
            <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5; color:#0f172a">
              <h2>Sign in to Capy School</h2>
              <p>Click the button below to securely sign in.</p>
              <p style="margin:24px 0">
                <a href="${signInUrl}" style="background:#4f46e5; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; display:inline-block">Sign in</a>
              </p>
              <p>Or copy and paste this URL into your browser:</p>
              <code style="word-break:break-all">${signInUrl}</code>
              <hr style="margin:24px 0; border:none; border-top:1px solid #e2e8f0"/>
              <p>If you did not request this, you can ignore this email.</p>
            </div>
          `;
          await sendEmail({
            to: email,
            subject: 'Your secure sign-in link',
            html,
          });
      }
    }),
    passkey({
      rpID: getEnv('PASSKEY_RP_ID', (() => {
        try { return new URL(getEnv('AUTH_BASE_URL', 'http://localhost:4321')).hostname; } catch { return 'localhost'; }
      })()),
      rpName: getEnv('PASSKEY_RP_NAME', 'CapySchool'),
      origin: getEnv('AUTH_BASE_URL', 'http://localhost:4321').replace(/\/+$/,''),
    }),
    apiKey(),
    // organization(),
    oAuthProxy({ 
      productionURL: "https://auth.capyschool.com", // Optional - if the URL isn't inferred correctly
      currentURL: "http://localhost:4321", // Optional - if the URL isn't inferred correctly
  }), 
  ],
});
