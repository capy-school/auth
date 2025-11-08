import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import type { Database } from './schema';

export const db = new Kysely<Database>({
  dialect: new LibsqlDialect({ 
    url: import.meta.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || '',
    authToken: import.meta.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '', }),
});
