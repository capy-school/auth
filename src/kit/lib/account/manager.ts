import type { Action } from 'svelte/action';

type ManagerName = 'sessions' | 'passkeys' | 'api-keys' | 'two-factor' | 'organizations';
type Options = { name: ManagerName; authorized: boolean };
type Mount = (root: HTMLElement) => void;

const loaders: Record<ManagerName, () => Promise<Mount>> = {
  sessions: async () => (await import('../../../components/account/sessions')).mountSessions,
  passkeys: async () => (await import('../../../components/account/passkeys')).mountPasskeys,
  'api-keys': async () => (await import('../../../components/account/api-keys')).mountApiKeys,
  'two-factor': async () => (await import('../../../components/account/two-factor')).mountTwoFactor,
  organizations: async () => (await import('../../../components/account/organizations')).mountOrganizations,
};

export function createManagerAction(load: (name: ManagerName) => Promise<Mount>): Action<HTMLElement, Options> {
  return (root, initial) => {
    let options = initial;
    let destroyed = false;
    let started = false;
    let mounted = false;
    let generation = 0;
    const retry = root.querySelector<HTMLButtonElement>('[data-retry]');
    async function start() {
      if (destroyed || !options.authorized || started || mounted) return;
      started = true;
      const ticket = ++generation;
      try {
        const mount = await load(options.name);
        if (destroyed || ticket !== generation || !options.authorized) return;
        mount(root);
        mounted = true;
      } catch {
        if (destroyed || ticket !== generation) return;
        const error = root.querySelector<HTMLElement>('[data-error]');
        if (error) { error.textContent = 'No se ha podido cargar esta sección. Vuelve a intentarlo.'; error.hidden = false; }
        const loading = root.querySelector<HTMLElement>('[data-loading]');
        if (loading) loading.hidden = true;
        if (retry) retry.hidden = false;
      } finally { if (ticket === generation) started = false; }
    }
    const onRetry = () => { void start(); };
    retry?.addEventListener('click', onRetry);
    void start();
    return {
      update(next) {
        if (!next.authorized) { ++generation; started = false; }
        options = next;
        void start();
      },
      destroy() { destroyed = true; ++generation; retry?.removeEventListener('click', onRetry); },
    };
  };
}

export const manager = createManagerAction(name => loaders[name]());
