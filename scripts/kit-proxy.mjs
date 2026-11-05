import { isIP } from 'node:net';

/** Server configuration only. Never import this module into a browser bundle. */
export function apiUpstream(value = 'http://127.0.0.1:4321') {
  const invalid = () => new Error('API_UPSTREAM must be an HTTP(S) origin without credentials, path, query or fragment.');
  if (typeof value !== 'string' || !value || /[\s?#]/u.test(value)) throw invalid();
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const dnsName = host.length <= 253 && host.split('.').every(label => /^[a-z\d](?:[a-z\d_-]{0,61}[a-z\d])?$/i.test(label));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (!isIP(host) && !dnsName) || url.port === '0') throw invalid();
  return url.origin;
}

export function kitProxy(upstream, localInbox = false) {
  const options = () => ({ target: apiUpstream(upstream), changeOrigin: true, xfwd: true, secure: true });
  return {
    // Vite tests req.url, which includes the query after the exact /api path.
    '^/api(?:[/?]|$)': options(),
    ...(localInbox ? { '^/dev/inbox(?:[/?]|$)': options() } : {}),
  };
}

export function kitProxyServer(upstream, localInbox = false, diagnostics = false) {
  // Vite's default CORS middleware otherwise answers OPTIONS before the proxy.
  // The API owns CORS and must receive its own preflight requests unchanged.
  return { cors: false, ...(!diagnostics ? { proxy: kitProxy(upstream, localInbox) } : {}) };
}
