import type { AppConfig } from '../../../shared/apps';
import { localPolicy, magicLinkDestination, postLoginDestination, selectRedirect } from '../../../shared/local-policy.mjs';

export type AppRegistry = Readonly<Record<string, Omit<AppConfig, 'validBases'> & { validBases: readonly string[] }>>;
export interface LocalPolicy { authOrigin: string; appOrigins: string[] }
export interface LoginPolicy { registry: AppRegistry; origin: string; local: LocalPolicy | null }
export interface LoginQuery { app: AppConfig | null; redirect: string | null; target: string | null; errors: string[] }
export interface ContinuationStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

// The shared registry and runtime policy are explicit inputs, without env reads.
export function createLoginPolicy(registry: AppRegistry, dev: boolean, optIn: string | undefined, origin: string): LoginPolicy {
  return { registry, origin, local: localPolicy(dev, optIn, origin) };
}

function appFor(id: string | null, policy: LoginPolicy): AppConfig | null {
  const key = id?.toLowerCase();
  if (!key || !Object.hasOwn(policy.registry, key)) return null;
  const app = policy.registry[key];
  const localIndex = app.id === 'capyschool' ? 0 : 1;
  return { ...app, validBases: policy.local ? [policy.local.appOrigins[localIndex]] : [...app.validBases] };
}

function allowed(app: AppConfig, redirect: string): boolean {
  try {
    const url = new URL(redirect);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && app.validBases.some(base => new URL(base).origin === url.origin);
  } catch { return false; }
}

export function validateLoginQuery(search: string, policy: LoginPolicy): LoginQuery {
  const params = new URLSearchParams(search);
  const appId = params.get('app');
  const redirect = params.get('redirect');
  const app = appFor(appId, policy);
  const errors: string[] = [];
  if (params.has('app') || params.has('redirect')) {
    if (!appId) errors.push('Missing parameter: app');
    if (!redirect) errors.push('Missing parameter: redirect');
    if (params.getAll('app').length > 1 || params.getAll('redirect').length > 1) errors.push('Duplicate login parameters');
    if (appId && !app) errors.push(`App not registered: ${appId}`);
    if (redirect) {
      try { new URL(redirect); }
      catch { errors.push(`Invalid redirect URL format: ${redirect}`); }
      if (app && !allowed(app, redirect)) errors.push(`App not registered for the provided redirect origin. Allowed bases: ${app.validBases.join(', ')}`);
    }
  }
  return { app, redirect, target: errors.length ? null : redirect || '/dashboard', errors };
}

export function safeStorage(access: () => ContinuationStorage): ContinuationStorage {
  return {
    getItem(key) { try { return access().getItem(key); } catch { return null; } },
    setItem(key, value) { try { access().setItem(key, value); } catch { /* Optional continuation only. */ } },
  };
}

export function rememberLogin(query: LoginQuery, storage?: ContinuationStorage): void {
  if (query.errors.length || !query.app || !query.redirect) return;
  try {
    storage?.setItem('app.id', query.app.id);
    storage?.setItem('app.redirect', query.redirect);
  } catch { /* Storage restrictions must not block login. */ }
}

export function continuationTarget(search: string, storage: ContinuationStorage | undefined, policy: LoginPolicy): string | null {
  if (validateLoginQuery(search, policy).errors.length) return null;
  return selectRedirect(search, storage, (id: string, target: string) => {
    const app = appFor(id, policy);
    return !!app && allowed(app, target);
  });
}

export function callbackDestination(target: string, policy: LoginPolicy): string {
  return postLoginDestination(target, policy.origin, policy.local);
}

export function magicLinkCallback(target: string, policy: LoginPolicy): string {
  return magicLinkDestination(target, policy.origin, policy.local);
}
