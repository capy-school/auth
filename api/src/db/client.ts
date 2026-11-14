import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import type { Database } from './schema';
import { localAuthPolicy } from '../lib/local-runtime';

const localURL = import.meta.env.DEV && localAuthPolicy
  ? (await import('../lib/local-auth')).validateLocalDatabase(import.meta.env.AUTH_LOCAL_DATABASE_URL)
  : null;

export const db = new Kysely<Database>({
  dialect: new LibsqlDialect({ 
    url: localURL ? `file:${localURL}` : import.meta.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || '',
    authToken: localAuthPolicy ? '' : import.meta.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '', }),
});
