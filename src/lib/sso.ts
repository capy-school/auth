import { APPS } from "./apps";

export const LEGACY_SSO_BRIDGE_URL =
  "https://auth.capyschool.com/api/sso/complete";

const EXTRA_ALLOWED_BASES = [
  "https://auth.capyschool.com",
  "https://auth.capy.town",
  "https://capyschool.com",
  "https://www.capyschool.com",
  "https://capy.town",
  "https://cms.capy.town",
  "https://know.capy.town",
  "https://storage.capy.town",
  "http://localhost:4321",
  "http://localhost:4322",
  "http://localhost:5174",
];

function getEnv(key: string, defaultValue = "") {
  return import.meta.env[key] || process.env[key] || defaultValue;
}

function getEnvList(key: string) {
  return getEnv(key)
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
}

const extraAllowedFromEnv = getEnvList("SSO_ALLOWED_REDIRECT_ORIGINS");

const ALLOWED_SSO_ORIGINS = new Set(
  [
    ...Object.values(APPS).flatMap((app) => app.validBases),
    ...EXTRA_ALLOWED_BASES,
    ...extraAllowedFromEnv,
  ]
    .map((base) => {
      try {
        return new URL(base).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);

export function isCapyTownHostname(hostname: string) {
  return hostname === "capy.town" || hostname.endsWith(".capy.town");
}

export function isSSORedirectAllowed(redirect: URL) {
  return ALLOWED_SSO_ORIGINS.has(redirect.origin);
}
