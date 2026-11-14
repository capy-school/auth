import type { AccountUser } from './types';

type Session = { state: 'anonymous' } | { state: 'authenticated'; user: AccountUser };
export type AccountState = Session | { state: 'loading' | 'error' };

export function createAccountSession({ read, update, redirect }: {
  read: (signal: AbortSignal) => Promise<Session>;
  update: (state: AccountState) => void;
  redirect: (path: string) => unknown;
}) {
  let controller: AbortController | undefined;
  let destroyed = false;
  return {
    async retry() {
      if (destroyed) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      update({ state: 'loading' });
      try {
        const result = await read(request.signal);
        if (destroyed || request.signal.aborted) return;
        if (result?.state === 'anonymous') {
          update({ state: 'anonymous' });
          await redirect('/');
        } else if (result?.state === 'authenticated' && typeof result.user?.id === 'string' && result.user.id.trim()) {
          update(result);
        } else {
          throw new Error('Invalid session');
        }
      } catch {
        if (!destroyed && !request.signal.aborted) update({ state: 'error' });
      }
    },
    destroy() { destroyed = true; controller?.abort(); },
  };
}

export type LogoutState = 'idle' | 'loading' | 'error';

export function createLogout({ signOut, update, redirect }: {
  signOut: () => Promise<unknown>;
  update: (state: LogoutState) => void;
  redirect: (path: string) => unknown;
}) {
  let busy = false;
  let destroyed = false;
  return {
    async submit() {
      if (destroyed || busy) return;
      busy = true;
      update('loading');
      try {
        const result = await signOut() as { data?: { success?: boolean } | null; error?: unknown } | null;
        if (destroyed) return;
        if (result?.error || result?.data?.success !== true) throw new Error('Sign out failed');
        await redirect('/');
      } catch {
        if (!destroyed) update('error');
      } finally { busy = false; }
    },
    destroy() { destroyed = true; },
  };
}
