import React, { useEffect, useState } from "react";
import { Mail, Fingerprint, ArrowRight } from "lucide-react";
import { AuthButton } from "./AuthButton";
import { getApp, isRedirectAllowed, type AppConfig } from "../lib/apps";
import { authClient } from "../lib/auth-client";
import { postLoginDestination, magicLinkDestination, selectRedirect } from '../lib/local-policy.mjs';
import { localClientPolicy } from '../lib/local-client';

const safeStorage = {
  getItem(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } },
  setItem(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* Optional persistence. */ } },
};

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
      fontSize="20"
      fontWeight="bold"
      fill="currentColor"
    >
      k
    </text>
  </svg>
);

const NaverIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
    <path d="M3 3h6l6 9V3h6v18h-6l-6-9v9H3z" />
  </svg>
);

const LineIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975 C23.176 14.393 24 12.458 24 10.314" />
  </svg>
);

export function LoginGateway() {
  const client = authClient;

  const postLoginURL = (target: string): string => {
    return postLoginDestination(target, window.location.origin, localClientPolicy);
  };

  const resolvePostLoginDestination = async (target: string) => {
    return postLoginURL(target);
  };

  const redirectAfterLogin = async (target: string) => {
    const destination = await resolvePostLoginDestination(target);
    window.location.href = destination;
  };

  const [email, setEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(true);
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
        safeStorage.setItem("app.id", resolvedApp.id);
        safeStorage.setItem("app.redirect", redirect);
      }
    } catch {
      // ignore
    }
  }, []);

  // Check for conditional UI support and preload passkeys for autofill
  useEffect(() => {
    if (localClientPolicy) return;
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
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && typeof data === "object" && "user" in data && data.user) {
            const target = selectRedirect(window.location.search, safeStorage, (id: string, redirect: string) => {
              const config = getApp(id);
              return !!config && isRedirectAllowed(config, redirect);
            });
            if (target) await redirectAfterLogin(target);
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
        safeStorage.setItem("app.id", app.id);
        safeStorage.setItem("app.redirect", redirectUrl);
      }
      const target =
        redirectUrl && app && isRedirectAllowed(app, redirectUrl)
          ? redirectUrl
          : "/dashboard";
      // Built-in providers use social; generic uses oauth2
      const callbackTarget = postLoginURL(target);
      const builtin = [
        "google",
        "github",
        "microsoft",
        "kakao",
        "naver",
        "line",
      ];
      if (builtin.includes(provider)) {
        await client.signIn.social({
          provider,
          callbackURL: callbackTarget,
          newUserCallbackURL: callbackTarget,
          errorCallbackURL: callbackTarget,
        });
      } else {
        await client.signIn.oauth2({
          providerId: provider,
          callbackURL: callbackTarget,
          newUserCallbackURL: callbackTarget,
          errorCallbackURL: callbackTarget,
        });
      }
    } catch (error) {
      console.error("OAuth error:", error);
    }
  };

  const handlePasskeyLogin = async () => {
    try {
      if (errors.length > 0) return;
      if (app && redirectUrl && isRedirectAllowed(app, redirectUrl)) {
        safeStorage.setItem("app.id", app.id);
        safeStorage.setItem("app.redirect", redirectUrl);
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
        safeStorage.setItem("app.id", app.id);
        safeStorage.setItem("app.redirect", redirectUrl);
      }
      const target =
        redirectUrl && app && isRedirectAllowed(app, redirectUrl)
          ? redirectUrl
          : "/dashboard";

      const callbackTarget = magicLinkDestination(target, window.location.origin, localClientPolicy);
      const { error } = await client.signIn.magicLink({
        email,
        callbackURL: callbackTarget,
        newUserCallbackURL: callbackTarget,
        errorCallbackURL: callbackTarget,
      });
      if (!error) {
        alert(localClientPolicy ? 'Magic link ready. Open the local inbox.' : "Magic link sent. Check your email.");
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

  // Keep SSR controls inert until the client and query validation are ready.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => { setIsHydrated(true); }, []);
  const signInDisabled = !isHydrated || errors.length > 0;
  const socialDisabled = signInDisabled || !!localClientPolicy;

  return (
    <section className="portal-login" aria-labelledby="login-heading" aria-busy={!isHydrated}>
        <noscript><p className="field-note">Activa JavaScript para acceder a tu cuenta.</p></noscript>
        {errors.length > 0 && (
          <div className="login-errors" role="alert">
            <p>No se puede continuar:</p>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="login-heading">
          <p className="section-index">01 / ACCESO</p>
          <h2 id="login-heading">Un gusto tenerte aquí.</h2>
          <p>Elige cómo quieres continuar.</p>
          {app && errors.length === 0 && (
            <div className="login-app">
              <p>
                Acceder a <strong>{app.name}</strong>
              </p>
              <p>{app.description}</p>
              {redirectUrl &&
                (() => {
                  try {
                    const o = new URL(redirectUrl).origin;
                    return (
                      <p className="login-destination">
                        Destino: {o}
                      </p>
                    );
                  } catch {
                    return null;
                  }
                })()}
            </div>
          )}
        </div>

        {showEmailInput && (
          <form className="email-form" method="post" onSubmit={(event) => { event.preventDefault(); void handleMagicLink(); }}>
            <label htmlFor="login-email">Correo electrónico</label>
            <div className="email-field">
              <Mail aria-hidden="true" />
              <input
                id="login-email"
                name="email"
                type="email"
                placeholder="nombre@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email webauthn"
                aria-describedby="login-email-note"
                spellCheck={false}
                disabled={!isHydrated}
                required
              />
            </div>
            <button type="submit" disabled={signInDisabled} className="primary-button">
              <span>Continuar con correo</span><ArrowRight aria-hidden="true" />
            </button>
            <p className="field-note" id="login-email-note">Recibe un enlace para entrar sin contraseña.</p>
          </form>
        )}

        {localClientPolicy && <a href="/dev/inbox" target="_blank" rel="noreferrer" className="local-inbox" aria-label="Abrir bandeja local (se abre en otra pestaña)">Abrir bandeja local</a>}
        {!localClientPolicy && (
          <button type="button" className="passkey-button" onClick={handlePasskeyLogin} disabled={signInDisabled}>
            <Fingerprint aria-hidden="true" />
            <span>Entrar con una passkey</span><span className="key-corner" aria-hidden="true">↗</span>
          </button>
        )}
          <div className="method-divider"><span>O CON TU CUENTA</span></div>

          <div className="providers" role="group" aria-label="Otros métodos de acceso" data-local-preview={localClientPolicy ? 'true' : undefined} aria-describedby={localClientPolicy ? 'login-local-social-note' : undefined}>
            <AuthButton
              provider="google"
              icon={<GoogleIcon />}
              onClick={() => handleOAuthLogin("google")}
              disabled={socialDisabled}
            >
              Google
            </AuthButton>

            <AuthButton
              provider="github"
              icon={<GithubIcon />}
              onClick={() => handleOAuthLogin("github")}
              disabled={socialDisabled}
            >
              GitHub
            </AuthButton>

            <AuthButton
              provider="microsoft"
              icon={<MicrosoftIcon />}
              onClick={() => handleOAuthLogin("microsoft")}
              disabled={socialDisabled}
            >
              Microsoft
            </AuthButton>

            <AuthButton
              provider="kakao"
              icon={<KakaoIcon />}
              onClick={() => handleOAuthLogin("kakao")}
              disabled={socialDisabled}
            >
              Kakao
            </AuthButton>

            <AuthButton
              provider="naver"
              icon={<NaverIcon />}
              onClick={() => handleOAuthLogin("naver")}
              disabled={socialDisabled}
            >
              Naver
            </AuthButton>

            <AuthButton
              provider="line"
              icon={<LineIcon />}
              onClick={() => handleOAuthLogin("line")}
              disabled={socialDisabled}
            >
              LINE
            </AuthButton>
          </div>
        {localClientPolicy && (
          <p className="field-note" id="login-local-social-note">En modo local, estos botones son solo visuales. El acceso social no está habilitado.</p>
        )}
        {!localClientPolicy && (
          <div className="configuration-note">
            <button type="button" disabled>Usar un código de correo</button><span>No configurado</span>
          </div>
        )}
        <p className="login-footnote">Un solo lugar para volver a tus aplicaciones.</p>
    </section>
  );
}
