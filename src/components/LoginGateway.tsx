import React, { useEffect, useState } from "react";
import { Mail, KeyRound, Fingerprint, Shield, Key, Clock } from "lucide-react";
import { AuthButton } from "./AuthButton";
import { getApp, isRedirectAllowed, type AppConfig } from "../lib/apps";
import { authClient } from "../lib/auth-client";
import { LEGACY_SSO_BRIDGE_URL, isCapyTownHostname } from "../lib/sso";

// TypeScript definitions for WebAuthn conditional UI
declare global {
  interface Window {
    PublicKeyCredential: {
      isConditionalMediationAvailable?: () => Promise<boolean>;
    };
  }
}

// SVG Icons for OAuth providers
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const GithubIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-full h-full"
    fill="currentColor"
    aria-hidden
  >
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.1.8-.26.8-.58v-2.23c-3.34.72-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.72.08-.72 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.53-1.52.12-3.17 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4s2.04.13 3 .4c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.38.82 1.1.82 2.22v3.29c0 .32.2.69.81.58C20.56 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
    <path fill="#f25022" d="M1 1h10v10H1z" />
    <path fill="#00a4ef" d="M13 1h10v10H13z" />
    <path fill="#7fba00" d="M1 13h10v10H1z" />
    <path fill="#ffb900" d="M13 13h10v10H13z" />
  </svg>
);

const KakaoIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <text
      x="50%"
      y="50%"
      dominantBaseline="middle"
      textAnchor="middle"
      fontSize="14"
      fontWeight="bold"
      fill="currentColor"
    >
      kakao
    </text>
  </svg>
);

const NaverIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const LineIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975 C23.176 14.393 24 12.458 24 10.314" />
  </svg>
);

export function LoginGateway() {
  const client = authClient;

  const resolvePostLoginDestination = async (target: string) => {
    try {
      const parsedTarget = new URL(target, window.location.origin);
      if (isCapyTownHostname(parsedTarget.hostname)) {
        return parsedTarget.toString();
      }

      const tokenRes = await fetch("/api/auth/one-time-token/generate", {
        method: "GET",
        credentials: "include",
      });
      if (!tokenRes.ok) {
        return parsedTarget.toString();
      }

      const tokenData = await tokenRes.json().catch(() => null);
      if (!tokenData?.token) {
        return parsedTarget.toString();
      }

      const bridgeURL = new URL(LEGACY_SSO_BRIDGE_URL);
      bridgeURL.searchParams.set("token", tokenData.token);
      bridgeURL.searchParams.set("redirect", parsedTarget.toString());
      return bridgeURL.toString();
    } catch {
      return target;
    }
  };

  const redirectAfterLogin = async (target: string) => {
    const destination = await resolvePostLoginDestination(target);
    window.location.href = destination;
  };

  const [email, setEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [authMethod, setAuthMethod] = useState<
    "magiclink" | "otp" | "passkey" | null
  >(null);
  const [supportsConditionalUI, setSupportsConditionalUI] = useState(false);

  // App + redirect handling
  const [app, setApp] = useState<AppConfig | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // parse query params on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const appId = params.get("app"); // capyschool | cms-ai
      const redirect = params.get("redirect");
      const resolvedApp = getApp(appId);
      setApp(resolvedApp);
      setRedirectUrl(redirect);

      const errs: string[] = [];

      // Only validate if at least one parameter is provided
      const hasParams = appId || redirect;

      if (hasParams) {
        // If any param is provided, both should be provided
        if (!appId) errs.push("Missing parameter: app");
        if (!redirect) errs.push("Missing parameter: redirect");

        // validate app id if provided
        if (appId && !resolvedApp) {
          errs.push(`App not registered: ${appId}`);
        }

        // validate redirect URL format
        if (redirect) {
          try {
            // eslint-disable-next-line no-new
            new URL(redirect);
          } catch {
            errs.push(`Invalid redirect URL format: ${redirect}`);
          }
        }

        // validate origin
        if (resolvedApp && redirect) {
          const ok = isRedirectAllowed(resolvedApp, redirect);
          if (!ok) {
            try {
              const o = new URL(redirect).origin;
              errs.push(
                `App not registered for the provided redirect origin: ${o}. Allowed bases: ${resolvedApp.validBases.join(", ")}`,
              );
            } catch {
              errs.push(`App not registered for the provided redirect.`);
            }
          }
        }
      }

      setErrors(errs);

      if (errs.length === 0 && resolvedApp && redirect) {
        // store for post-login redirect
        localStorage.setItem("app.id", resolvedApp.id);
        localStorage.setItem("app.redirect", redirect);
      }
    } catch {
      // ignore
    }
  }, []);

  // Check for conditional UI support and preload passkeys for autofill
  useEffect(() => {
    (async () => {
      // Check if browser supports conditional UI
      if (
        typeof window !== "undefined" &&
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isConditionalMediationAvailable ===
          "function"
      ) {
        try {
          const available =
            await window.PublicKeyCredential.isConditionalMediationAvailable();
          setSupportsConditionalUI(available);

          // If supported, preload passkeys for autofill
          if (available) {
            const target =
              redirectUrl && app && isRedirectAllowed(app, redirectUrl)
                ? redirectUrl
                : "/dashboard";

            // Start autofill passkey prompt in background
            void client.signIn.passkey({
              autoFill: true,
              fetchOptions: {
                onSuccess() {
                  void redirectAfterLogin(target);
                },
                onError(ctx) {
                  // Silently fail for autofill - user can still click the button
                  console.debug("Autofill passkey not used:", ctx.error);
                },
              },
            });
          }
        } catch (err) {
          console.debug("Conditional UI check failed:", err);
        }
      }
    })();
  }, [app, redirectUrl]);

  // After login, Better Auth will return to our origin; if already signed in, redirect to target
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.user) {
            const savedAppId = localStorage.getItem("app.id");
            const savedRedirect = localStorage.getItem("app.redirect");
            const appCfg = getApp(savedAppId);
            if (
              appCfg &&
              savedRedirect &&
              isRedirectAllowed(appCfg, savedRedirect)
            ) {
              await redirectAfterLogin(savedRedirect);
              return;
            }
            // If no callback URL, redirect to dashboard
            if (!savedRedirect || !appCfg) {
              await redirectAfterLogin("/dashboard");
              return;
            }
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const handleOAuthLogin = async (provider: string) => {
    try {
      if (errors.length > 0) return;
      if (app && redirectUrl && isRedirectAllowed(app, redirectUrl)) {
        localStorage.setItem("app.id", app.id);
        localStorage.setItem("app.redirect", redirectUrl);
      }
      // Built-in providers use social; generic uses oauth2
      const builtin = [
        "google",
        "github",
        "microsoft",
        "kakao",
        "naver",
        "line",
      ];
      if (builtin.includes(provider)) {
        await client.signIn.social({ provider });
      } else {
        await client.signIn.oauth2({ providerId: provider });
      }
    } catch (error) {
      console.error("OAuth error:", error);
    }
  };

  const handlePasskeyLogin = async () => {
    try {
      if (errors.length > 0) return;
      if (app && redirectUrl && isRedirectAllowed(app, redirectUrl)) {
        localStorage.setItem("app.id", app.id);
        localStorage.setItem("app.redirect", redirectUrl);
      }
      const target =
        redirectUrl && app && isRedirectAllowed(app, redirectUrl)
          ? redirectUrl
          : "/dashboard";

      const result = await client.signIn.passkey({
        fetchOptions: {
          onSuccess() {
            void redirectAfterLogin(target);
          },
          onError(ctx) {
            console.error("Passkey sign-in failed:", ctx.error);
            alert(
              "Passkey sign-in failed: " +
                (ctx.error?.message || "Unknown error"),
            );
          },
        },
      });

      // If successful and no redirect happened, manually redirect
      if (result?.data) {
        await redirectAfterLogin(target);
      }
    } catch (error: any) {
      console.error("Passkey error:", error);
      alert("Passkey error: " + (error?.message || "Unknown error"));
    }
  };

  const handleMagicLink = async () => {
    if (!email) return;
    try {
      if (errors.length > 0) return;
      if (app && redirectUrl && isRedirectAllowed(app, redirectUrl)) {
        localStorage.setItem("app.id", app.id);
        localStorage.setItem("app.redirect", redirectUrl);
      }
      const target =
        redirectUrl && app && isRedirectAllowed(app, redirectUrl)
          ? redirectUrl
          : "/dashboard";

      const { error } = await client.signIn.magicLink({
        email,
        callbackURL: target,
        newUserCallbackURL: target,
        errorCallbackURL: target,
      });
      if (!error) {
        alert("Magic link sent. Check your email.");
      } else {
        console.error("Magic link error:", error);
      }
    } catch (error) {
      console.error("Magic link error:", error);
    }
  };

  const handleEmailOTP = async () => {
    if (!email) return;
    try {
      // Email OTP placeholder
      console.log("Email OTP for:", email);
      alert(
        "Email OTP feature - Configure email service and Better Auth plugin",
      );
    } catch (error) {
      console.error("Email OTP error:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-3">
      <div className="w-full max-w-lg bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-gray-700">
        {/* Errors at very top */}
        {errors.length > 0 && (
          <div className="mb-4 text-left text-xs text-red-400 bg-red-950/30 border border-red-700/40 rounded-md p-2">
            <p className="font-semibold mb-1">Unable to proceed:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Welcome Back</h1>
          <p className="text-sm text-gray-400">
            Sign in to your account using your preferred method
          </p>
          {/* App info */}
          {app && errors.length === 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-300">
                Sign in to <span className="font-semibold">{app.name}</span>
              </p>
              <p className="text-[11px] text-gray-400">{app.description}</p>
              {redirectUrl &&
                (() => {
                  try {
                    const o = new URL(redirectUrl).origin;
                    return (
                      <p className="text-[11px] text-gray-500">
                        Destination: {o}
                      </p>
                    );
                  } catch {
                    return null;
                  }
                })()}
            </div>
          )}
        </div>

        {/* Passwordless Methods */}
        <div className="space-y-2.5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Passwordless
            </h2>
            {/* {supportsConditionalUI && (
              <span className="text-[10px] text-green-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                Autofill Ready
              </span>
            )} */}
          </div>

          <AuthButton
            provider="passkey"
            icon={<Fingerprint />}
            onClick={handlePasskeyLogin}
            className={
              errors.length ? "opacity-50 pointer-events-none" : undefined
            }
          >
            Sign in with Passkey
          </AuthButton>

          {!showEmailInput && (
            <AuthButton
              provider="email"
              icon={<Mail />}
              onClick={() => setShowEmailInput(true)}
              className={
                errors.length ? "opacity-50 pointer-events-none" : undefined
              }
            >
              Sign in with Email
            </AuthButton>
          )}

          {showEmailInput && (
            <div className="space-y-2.5">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email webauthn"
                className="w-full px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleMagicLink}
                  disabled={errors.length > 0}
                  className={`px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 ${errors.length ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Key className="w-4 h-4" />
                  Magic Link
                </button>
                <button
                  onClick={handleEmailOTP}
                  disabled={errors.length > 0}
                  className={`px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 ${errors.length ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <KeyRound className="w-4 h-4" />
                  Email OTP
                </button>
              </div>
            </div>
          )}
        </div>

        {/* OAuth Providers */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            OAuth Providers
          </h2>

          <div className="grid grid-cols-2 gap-2">
            <AuthButton
              provider="google"
              icon={<GoogleIcon />}
              onClick={() => handleOAuthLogin("google")}
              className={
                errors.length ? "opacity-50 pointer-events-none" : undefined
              }
            >
              Google
            </AuthButton>

            <AuthButton
              provider="github"
              icon={<GithubIcon />}
              onClick={() => handleOAuthLogin("github")}
              className={
                errors.length ? "opacity-50 pointer-events-none" : undefined
              }
            >
              GitHub
            </AuthButton>

            <AuthButton
              provider="microsoft"
              icon={<MicrosoftIcon />}
              onClick={() => handleOAuthLogin("microsoft")}
              className={
                errors.length ? "opacity-50 pointer-events-none" : undefined
              }
            >
              Microsoft
            </AuthButton>

            <AuthButton
              provider="kakao"
              icon={<KakaoIcon />}
              onClick={() => handleOAuthLogin("kakao")}
              className={
                errors.length ? "opacity-50 pointer-events-none" : undefined
              }
            >
              Kakao
            </AuthButton>

            <AuthButton
              provider="naver"
              icon={<NaverIcon />}
              onClick={() => handleOAuthLogin("naver")}
              className={
                errors.length ? "opacity-50 pointer-events-none" : undefined
              }
            >
              Naver
            </AuthButton>

            <AuthButton
              provider="line"
              icon={<LineIcon />}
              onClick={() => handleOAuthLogin("line")}
              className={
                errors.length ? "opacity-50 pointer-events-none" : undefined
              }
            >
              Line
            </AuthButton>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>2FA Protected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Session Management</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
