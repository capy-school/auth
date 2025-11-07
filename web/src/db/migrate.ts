import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

async function migrate() {
  console.log('🚀 Starting database migration...');

  try {
    // Users table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        emailVerified INTEGER DEFAULT 0,
        name TEXT,
        image TEXT,
        role TEXT DEFAULT 'user',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sessions table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Accounts table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        accessToken TEXT,
        refreshToken TEXT,
        idToken TEXT,
        expiresAt TEXT,
        scope TEXT,
        password TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Verification table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Passkey table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS passkey (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        credentialId TEXT UNIQUE NOT NULL,
        publicKey TEXT NOT NULL,
        counter INTEGER DEFAULT 0,
        deviceType TEXT NOT NULL,
        backedUp INTEGER DEFAULT 0,
        transports TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // TwoFactor table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS twoFactor (
        id TEXT PRIMARY KEY,
        userId TEXT UNIQUE NOT NULL,
        secret TEXT NOT NULL,
        backupCodes TEXT NOT NULL,
        enabled INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // Organization table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS organization (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        logo TEXT,
        metadata TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // OrganizationMember table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS organizationMember (
        id TEXT PRIMARY KEY,
        organizationId TEXT NOT NULL,
        userId TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE,
        UNIQUE(organizationId, userId)
      )
    `);

    // ApiKey table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS apiKey (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        key TEXT UNIQUE NOT NULL,
        expiresAt TEXT,
        lastUsedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // OAuthToken table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS oauthToken (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        provider TEXT NOT NULL,
        accessToken TEXT NOT NULL,
        refreshToken TEXT,
        expiresAt TEXT,
        scope TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    // OneTimeToken table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS oneTimeToken (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expiresAt TEXT NOT NULL,
        usedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.close();
  }
}

migrate();
