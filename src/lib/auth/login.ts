import { callbackDestination, magicLinkCallback, type LoginPolicy } from './policy';

interface AuthError { message?: string }
interface AuthResult { data?: unknown; error?: AuthError | null }
interface Callbacks { callbackURL: string; newUserCallbackURL: string; errorCallbackURL: string }
interface PasskeyOptions {
  autoFill: boolean;
  fetchOptions: { onSuccess(): void; onError(context: { error?: AuthError }): void };
}
export interface LoginClient {
  signIn: {
    social?: (input: Callbacks & { provider: string }) => Promise<AuthResult | null | undefined>;
    oauth2?: (input: Callbacks & { providerId: string }) => Promise<AuthResult | null | undefined>;
    magicLink?: (input: Callbacks & { email: string }) => Promise<AuthResult | null | undefined>;
    passkey?: (input: PasskeyOptions) => Promise<AuthResult | null | undefined>;
  };
}

const builtInProviders = ['google', 'github', 'microsoft', 'kakao', 'naver', 'line'];
const callbacks = (target: string): Callbacks => ({ callbackURL: target, newUserCallbackURL: target, errorCallbackURL: target });
function checkResult(result: AuthResult | null | undefined): void {
  if (result?.error) throw new Error(result.error.message || 'Sign-in failed');
}

export async function signInOAuth(client: LoginClient, provider: string, target: string, policy: LoginPolicy): Promise<void> {
  if (policy.local) throw new Error('Social sign-in is disabled in local mode');
  const destination = callbacks(callbackDestination(target, policy));
  const operation = builtInProviders.includes(provider)
    ? client.signIn.social?.({ provider, ...destination })
    : client.signIn.oauth2?.({ providerId: provider, ...destination });
  if (!operation) throw new Error('Provider sign-in is not configured');
  checkResult(await operation);
}

export async function signInMagicLink(client: LoginClient, email: string, target: string, policy: LoginPolicy): Promise<void> {
  if (!email.trim()) throw new Error('Email is required');
  if (!client.signIn.magicLink) throw new Error('Magic link is not configured');
  checkResult(await client.signIn.magicLink({ email, ...callbacks(magicLinkCallback(target, policy)) }));
}

export async function signInPasskey(client: LoginClient, target: string, policy: LoginPolicy, navigate: (destination: string) => void, autoFill = false): Promise<void> {
  if (policy.local) throw new Error('Passkeys are disabled in local mode');
  if (!client.signIn.passkey) throw new Error('Passkey sign-in is not configured');
  let navigated = false;
  let failure: AuthError | undefined;
  const onSuccess = () => {
    if (navigated) return;
    navigated = true;
    navigate(callbackDestination(target, policy));
  };
  const result = await client.signIn.passkey({
    autoFill,
    fetchOptions: { onSuccess, onError(context) { failure = context.error || { message: 'Passkey sign-in failed' }; } },
  });
  if (failure) throw new Error(failure.message || 'Passkey sign-in failed');
  checkResult(result);
  if (result?.data) onSuccess();
}
