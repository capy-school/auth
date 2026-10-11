import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db';
import { magicLink, oneTimeToken, organization, apiKey, twoFactor } from 'better-auth/plugins';
import { Kysely } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPolicy } from './local-policy.mjs';
import { createInbox } from './local-inbox.mjs';

export function validateLocalDatabase(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'file:' || url.host || url.search || url.hash || !url.pathname.endsWith('/.local-auth/auth.db') || value.includes('..')) {
    throw new Error('Local Auth requires its isolated .local-auth/auth.db file');
  }
  return fileURLToPath(url);
}

export function localFileInbox(databaseURL: string) {
  const path = join(dirname(validateLocalDatabase(databaseURL)), 'inbox.json');
  return createInbox({
    read: () => {
      try { return JSON.parse(readFileSync(path, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    },
    write: messages => writeFileSync(path, JSON.stringify(messages), { mode: 0o600 }),
  });
}

export async function createLocalAuth(config: { origin: string; databaseURL: string; secret: string }, migrate = false) {
  const policy = localPolicy(true, '1', config.origin)!;
  validateLocalDatabase(config.databaseURL);
  if (!config.secret || config.secret.length < 32) throw new Error('Local Auth requires an isolated secret');
  const inbox = localFileInbox(config.databaseURL);
  const db = new Kysely({ dialect: new LibsqlDialect({ url: config.databaseURL }) });
  const auth = betterAuth({
    baseURL: policy.authOrigin,
    secret: config.secret,
    database: { db, type: 'sqlite' },
    trustedOrigins: [policy.authOrigin, ...policy.appOrigins],
    emailAndPassword: { enabled: false },
    socialProviders: {},
    advanced: { crossSubDomainCookies: { enabled: false } },
    logger: { disabled: true },
    plugins: [
      magicLink({ expiresIn: 300, sendMagicLink: async ({ email, url }) => { inbox.add({ email, url }); } }),
      oneTimeToken(), organization(), apiKey(), twoFactor(),
    ],
  });
  if (migrate) {
    const migrations = await getMigrations(auth.options);
    await migrations.runMigrations();
  }
  return { auth, inbox, close: () => db.destroy() };
}
