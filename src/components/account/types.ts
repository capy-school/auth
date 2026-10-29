export interface AccountUser {
  id?: string;
  name?: string | null;
  email?: string;
  image?: string | null;
  role?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
}
