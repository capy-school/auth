export function localPolicy(dev, optIn, origin) {
  if (!dev || optIn !== '1') return null;
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'auth.localhost' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Local Auth requires the exact Portless auth.localhost origin');
  }
  return {
    authOrigin: url.origin,
    appOrigins: ['school', 'cms'].map(name => `${url.protocol}//${name}.localhost${url.port ? `:${url.port}` : ''}`),
  };
}

export function isLocalTarget(target, policy) {
  try {
    const url = new URL(target);
    return !!policy && !url.username && !url.password && policy.appOrigins.includes(url.origin);
  } catch { return false; }
}

/** @param {{authOrigin: string, appOrigins: string[]} | null} policy */
export function postLoginDestination(target, origin, policy = null) {
  try {
    const url = new URL(target, origin);
    if (url.username || url.password) return '/';
    if (url.origin === origin) return `${url.pathname}${url.search}${url.hash}`;
    if (policy && !isLocalTarget(url, policy)) return '/';
    if (!policy && (url.hostname === 'capy.town' || url.hostname.endsWith('.capy.town'))) return url.toString();
    return `/api/sso/bridge?${new URLSearchParams({ redirect: url.toString() })}`;
  } catch { return '/'; }
}

/** @param {{authOrigin: string, appOrigins: string[]} | null} policy */
export function magicLinkDestination(target, origin, policy = null) {
  const destination = postLoginDestination(target, origin, policy);
  // Better Auth 1.3 decodes relative callbacks before validation; nested URL
  // query parameters then fail its relative-URL regex. Absolute local URLs
  // are validated against the exact Auth origin instead.
  return policy ? new URL(destination, origin).toString() : destination;
}

export function selectRedirect(search, storage, allowed) {
  const params = new URLSearchParams(search);
  if (params.has('app') || params.has('redirect')) {
    const app = params.get('app');
    const target = params.get('redirect');
    return app && target && allowed(app, target) ? target : null;
  }
  try {
    const app = storage?.getItem('app.id');
    const target = storage?.getItem('app.redirect');
    if (app && target && allowed(app, target)) return target;
  } catch { /* Storage can be disabled by browser policy. */ }
  return '/dashboard';
}
