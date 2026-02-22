import { betterAuth } from "better-auth";
import {
  apiKey,
  magicLink,
  oneTimeToken,
  oAuthProxy,
  twoFactor,
  organization,
  openAPI,
  oidcProvider,
} from "better-auth/plugins";
import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { passkey } from "better-auth/plugins/passkey";
import { sendEmail } from "./email";

function getEnv(key: string, defaultValue?: string) {
  return import.meta.env[key] || process.env[key] || defaultValue;
}

function getEnvList(key: string) {
  const raw = getEnv(key, "");
  return raw
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
}

const authBaseURL = getEnv("AUTH_BASE_URL", "http://localhost:4321");
const authBaseHostname = (() => {
  try {
    return new URL(authBaseURL).hostname;
  } catch {
    return "localhost";
  }
})();

const configuredCookieDomains = getEnvList("AUTH_COOKIE_DOMAINS");
const explicitCookieDomain = getEnv("AUTH_COOKIE_DOMAIN", "").trim();
const inferredCookieDomain = authBaseURL.includes("capyschool.com")
  ? "capyschool.com"
  : authBaseURL.includes("capy.town")
    ? "capy.town"
    : "";

const cookieDomain =
  explicitCookieDomain ||
  configuredCookieDomains.find(
    (domain: string) =>
      authBaseHostname === domain || authBaseHostname.endsWith(`.${domain}`),
  ) ||
  configuredCookieDomains[0] ||
  inferredCookieDomain;

const defaultTrustedOrigins = [
  "https://auth.capyschool.com",
  "https://capyschool.com",
  "https://www.capyschool.com",
  "https://cms.capyschool.com",
  "https://auth.capy.town",
  "https://capy.town",
  "http://localhost:4321",
];

const trustedOrigins = Array.from(
  new Set([...defaultTrustedOrigins, ...getEnvList("AUTH_TRUSTED_ORIGINS")]),
);

const isDevelopment =
  getEnv("NODE_ENV", "development") === "development" ||
  getEnv("AUTH_BASE_URL", "").includes("localhost");

interface Database {}
const db = new Kysely<Database>({
  dialect: new LibsqlDialect({
    url:
      import.meta.env.TURSO_DATABASE_URL ||
      process.env.TURSO_DATABASE_URL ||
      "",
    authToken:
      import.meta.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || "",
  }),
});

export const auth = betterAuth({
  baseURL: authBaseURL,
  database: {
    db: db,
    type: "sqlite",
  },
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: getEnv("GOOGLE_CLIENT_ID"),
      clientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
      // Ensure provider redirects back to the correct domain
      redirectURI: `${getEnv("AUTH_BASE_URL", "http://localhost:4321")}/api/auth/callback/google`,
    },
    github: {
      clientId: getEnv("GITHUB_CLIENT_ID"),
      clientSecret: getEnv("GITHUB_CLIENT_SECRET"),
      // Ensure provider redirects back to the correct domain
      redirectURI: `${getEnv("AUTH_BASE_URL", "http://localhost:4321")}/api/auth/callback/github`,
    },
    microsoft: {
      clientId: getEnv("MICROSOFT_CLIENT_ID"),
      clientSecret: getEnv("MICROSOFT_CLIENT_SECRET"),
      // Optional
      tenantId: "common",
      authority: "https://login.microsoftonline.com", // Authentication authority URL
      prompt: "select_account", // Forces account selection
      redirectURI: `${getEnv("AUTH_BASE_URL", "http://localhost:4321")}/api/auth/callback/microsoft`,
    },
    kakao: {
      clientId: getEnv("KAKAO_CLIENT_ID"),
      clientSecret: getEnv("KAKAO_CLIENT_SECRET"),
      redirectURI: `${getEnv("AUTH_BASE_URL", "http://localhost:4321")}/api/auth/callback/kakao`,
    },
    naver: {
      clientId: getEnv("NAVER_CLIENT_ID"),
      clientSecret: getEnv("NAVER_CLIENT_SECRET"),
      redirectURI: `${getEnv("AUTH_BASE_URL", "http://localhost:4321")}/api/auth/callback/naver`,
    },
    line: {
      clientId: getEnv("LINE_CLIENT_ID"),
      clientSecret: getEnv("LINE_CLIENT_SECRET"),
      redirectURI: `${getEnv("AUTH_BASE_URL", "http://localhost:4321")}/api/auth/callback/line`,
      // Optional: override redirect if needed
      // redirectURI: "https://your.app/api/auth/callback/line",
      // scopes are prefilled: ["openid","profile","email"]. Append if needed
    },
  },
  advanced: {
    crossSubDomainCookies: cookieDomain
      ? {
          enabled: true,
          domain: cookieDomain,
        }
      : undefined,
  },
  // CORS/trusted origins: local dev + app frontends + Apple (for Sign in with Apple web flow)
  trustedOrigins,
  secret: getEnv("BETTER_AUTH_SECRET"),
  plugins: [
    twoFactor(),
    //   phoneNumber({
    //     sendOTP: ({ phoneNumber, code }, request) => {
    //         // Implement sending OTP code via SMS
    //     }
    // }),
    magicLink({
      sendMagicLink: async ({ email, token, url }, request) => {
        const appBase = getEnv(
          "AUTH_BASE_URL",
          "http://localhost:4321",
        ).replace(/\/+$/, "");
        const signInUrl =
          url ||
          `${appBase}/api/auth/magic-link?token=${encodeURIComponent(token)}`;
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
          subject: "Your secure sign-in link",
          html,
        });
      },
    }),
    passkey({
      rpID: getEnv(
        "PASSKEY_RP_ID",
        (() => {
          try {
            return new URL(getEnv("AUTH_BASE_URL", "http://localhost:4321"))
              .hostname;
          } catch {
            return "localhost";
          }
        })(),
      ),
      rpName: getEnv("PASSKEY_RP_NAME", "CapySchool"),
      origin: getEnv("AUTH_BASE_URL", "http://localhost:4321").replace(
        /\/+$/,
        "",
      ),
    }),
    apiKey({
      rateLimit:
        isDevelopment || true
          ? {
              enabled: false, // Disable rate limiting in development
            }
          : {
              enabled: true,
              maxRequests: 100,
              timeWindow: 60, // 100 requests per 60 seconds in production
            },
    }),
    oneTimeToken(),
    organization(),
    oAuthProxy({
      productionURL: "https://auth.capyschool.com", // Optional - if the URL isn't inferred correctly
      currentURL: "http://localhost:4321", // Optional - if the URL isn't inferred correctly
    }),
    oidcProvider({
      loginPage: "/",
      consentPage: "/auth/authorize",
      allowDynamicClientRegistration: true,
      accessTokenExpiresIn: 3600, // 1 hour
      refreshTokenExpiresIn: 3600 * 24 * 30, // 30 days
    }),
    openAPI(),
  ],
});
