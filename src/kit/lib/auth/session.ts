import type { AccountUser } from '../../../components/account/types';

export type SessionState = { state: 'anonymous' } | { state: 'authenticated'; user: AccountUser };

function sessionUser(value: unknown): AccountUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid session user');
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || !input.id.trim()) throw new Error('Invalid session user id');

  // Copy only the public profile contract, never session tokens or extra fields.
  const user: AccountUser = { id: input.id };
  for (const field of ['name', 'email', 'image', 'role', 'emailVerified', 'twoFactorEnabled'] as const) {
    if (!(field in input)) continue;
    const value = input[field];
    const nullable = field === 'name' || field === 'image';
    const expected = field === 'emailVerified' || field === 'twoFactorEnabled' ? 'boolean' : 'string';
    if (!(nullable && value === null) && typeof value !== expected) throw new Error(`Invalid session user ${field}`);
    Object.assign(user, { [field]: value });
  }
  return user;
}

/** Browser bootstrap only. Importing this module never reads a session. */
export async function readSession(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<SessionState> {
  const response = await fetcher('/api/session', { credentials: 'include', cache: 'no-store', signal });
  if (response.status === 401) return { state: 'anonymous' };
  if (!response.ok) throw new Error(`Session request failed (${response.status})`);
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('Invalid session response'); }
  if (!data || typeof data !== 'object' || !('user' in data)) throw new Error('Invalid session response');
  return { state: 'authenticated', user: sessionUser(data.user) };
}
