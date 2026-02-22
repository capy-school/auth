export type AppId = "capyschool" | "cms-ai";

export interface AppConfig {
  id: AppId;
  name: string;
  description: string;
  // List of allowed base URLs (origins) for redirects (testing and production)
  validBases: string[];
}

export const APPS: Record<AppId, AppConfig> = {
  capyschool: {
    id: "capyschool",
    name: "CapySchool",
    description: "Learning platform for students and educators.",
    validBases: [
      "http://localhost:5174",
      "http://localhost:4321",
      "http://localhost:4322",
      "https://capyschool.com",
      "https://www.capyschool.com",
      "https://auth.capyschool.com",
      "https://auth.capy.town",
      "https://cms.capy.town",
      "https://know.capy.town",
      "https://storage.capy.town",
      "https://capy.town",
    ],
  },
  "cms-ai": {
    id: "cms-ai",
    name: "CMS-AI",
    description: "AI-assisted content management system.",
    validBases: [
      "http://localhost:5174",
      "http://localhost:4321",
      "http://localhost:4322",
      "https://auth.capyschool.com",
      "https://auth.capy.town",
      "https://cms.capy.town",
      "https://capy.town",
      "https://know.capy.town",
      "https://storage.capy.town",
    ],
  },
};

export function getApp(id?: string | null): AppConfig | null {
  if (!id) return null;
  const key = id.toLowerCase() as AppId;
  return (APPS as any)[key] ?? null;
}

export function isRedirectAllowed(app: AppConfig, redirect: string): boolean {
  try {
    const url = new URL(redirect);
    // match by origin (base URL)
    return app.validBases.some((base) => {
      try {
        const b = new URL(base);
        return b.origin === url.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
