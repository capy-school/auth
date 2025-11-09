import type { ColumnType } from "kysely";

export interface Database {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  passkey: PasskeyTable;
  twoFactor: TwoFactorTable;
  organization: OrganizationTable;
  member: MemberTable;
  invitation: InvitationTable;
  apiKey: ApiKeyTable;
  oauthToken: OAuthTokenTable;
  oneTimeToken: OneTimeTokenTable;
}

export interface UserTable {
  id: string;
  email: string;
  emailVerified: number; // boolean as 0/1
  name: string | null;
  image: string | null;
  role: "user" | "admin";
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, string>;
}

export interface SessionTable {
  id: string;
  userId: string;
  expiresAt: ColumnType<Date, string, string>;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId: string | null;
  createdAt: ColumnType<Date, string | undefined, never>;
}

export interface AccountTable {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: ColumnType<Date | null, string | null, string | null>;
  scope: string | null;
  password: string | null;
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, string>;
}

export interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: ColumnType<Date, string, string>;
  createdAt: ColumnType<Date, string | undefined, never>;
}

export interface PasskeyTable {
  id: string;
  userId: string;
  name: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: number; // boolean as 0/1
  transports: string | null;
  createdAt: ColumnType<Date, string | undefined, never>;
}

export interface TwoFactorTable {
  id: string;
  userId: string;
  secret: string;
  backupCodes: string;
  enabled: number; // boolean as 0/1
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, string>;
}

export interface OrganizationTable {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, string>;
}

export interface MemberTable {
  id: string;
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  createdAt: ColumnType<Date, string | undefined, never>;
}

export interface InvitationTable {
  id: string;
  organizationId: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "pending" | "accepted" | "rejected" | "canceled";
  expiresAt: ColumnType<Date, string, string>;
  inviterId: string;
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, string>;
}

export interface ApiKeyTable {
  id: string;
  userId: string;
  name: string;
  key: string;
  expiresAt: ColumnType<Date | null, string | null, string | null>;
  lastUsedAt: ColumnType<Date | null, string | null, string | null>;
  createdAt: ColumnType<Date, string | undefined, never>;
}

export interface OAuthTokenTable {
  id: string;
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: ColumnType<Date | null, string | null, string | null>;
  scope: string | null;
  createdAt: ColumnType<Date, string | undefined, never>;
}

export interface OneTimeTokenTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: ColumnType<Date, string, string>;
  usedAt: ColumnType<Date | null, string | null, string | null>;
  createdAt: ColumnType<Date, string | undefined, never>;
}
