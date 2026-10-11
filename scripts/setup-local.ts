import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createLocalAuth } from '../src/lib/local-auth';
import { localPolicy } from '../src/lib/local-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const state = new URL('../.local-auth/', import.meta.url);
await mkdir(state, { recursive: true, mode: 0o700 });
await chmod(state, 0o700);
const secretPath = new URL('secret', state);
try { await writeFile(secretPath, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 }); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
const secret = await readFile(secretPath, 'utf8');
const databaseURL = new URL('auth.db', state).href;
const envPath = new URL('../.env.development.local', import.meta.url);
const defaults = {
  AUTH_LOCAL_MODE: '1',
  PUBLIC_AUTH_LOCAL_MODE: '1',
  AUTH_BASE_URL: 'http://auth.localhost',
  PUBLIC_AUTH_URL: 'http://auth.localhost',
  AUTH_LOCAL_DATABASE_URL: databaseURL,
  AUTH_LOCAL_SECRET: secret,
};
try {
  await writeFile(envPath, Object.entries(defaults).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
}
const env = loadEnv('development', root, '');
const policy = localPolicy(true, env.AUTH_LOCAL_MODE, env.AUTH_BASE_URL);
const clientPolicy = localPolicy(true, env.PUBLIC_AUTH_LOCAL_MODE, env.PUBLIC_AUTH_URL);
if (!policy || clientPolicy?.authOrigin !== policy.authOrigin) {
  throw new Error('Local setup requires matching server and client local mode and origins');
}
const instance = await createLocalAuth({
  origin: policy.authOrigin,
  databaseURL: env.AUTH_LOCAL_DATABASE_URL,
  secret: env.AUTH_LOCAL_SECRET,
}, true);
await instance.close();
console.info(`Local Auth prepared for ${policy.authOrigin}. Start the dev script to serve it.`);
