export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function data<T>(response: { data: T | null; error?: { message?: string; status?: number } | null }): T {
  if (response.error) {
    throw new Error(response.error.status === 401
      ? 'Tu sesión ha caducado o necesita verificarse de nuevo. Vuelve a iniciar sesión.'
      : response.error.message || 'No se ha podido completar la operación.');
  }
  if (response.data === null || response.data === undefined) throw new Error('No se ha recibido una respuesta válida. Vuelve a iniciar sesión e inténtalo de nuevo.');
  return response.data;
}

export function dateLabel(value?: string | Date | null): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function action(label: string, click: (button: HTMLButtonElement) => void, attribute?: string): HTMLButtonElement {
  const button = element('button', 'account-button', label);
  button.type = 'button';
  if (attribute) button.setAttribute(attribute, '');
  button.addEventListener('click', () => click(button));
  return button;
}

export function accountUI(root: HTMLElement) {
  const error = root.querySelector<HTMLElement>('[data-error]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const loading = root.querySelector<HTMLElement>('[data-loading]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-retry]')!;
  function fail(reason: unknown) {
    status.textContent = '';
    error.textContent = reason instanceof Error ? reason.message : 'No se ha podido completar la operación. Inténtalo de nuevo.';
    error.hidden = false;
  }
  return {
    fail,
    async load(work: () => Promise<void>): Promise<boolean> {
      error.hidden = true;
      retry.hidden = true;
      loading.hidden = false;
      root.setAttribute('aria-busy', 'true');
      try { await work(); return true; }
      catch (reason) { fail(reason); retry.hidden = false; return false; }
      finally { loading.hidden = true; root.setAttribute('aria-busy', 'false'); }
    },
    async perform(button: HTMLButtonElement, work: () => Promise<void>, message: string): Promise<void> {
      if (button.disabled) return;
      button.disabled = true;
      error.hidden = true;
      status.textContent = '';
      try { await work(); status.textContent = message; }
      catch (reason) { fail(reason); }
      finally { button.disabled = false; }
    },
    retry(work: () => Promise<unknown>) { retry.addEventListener('click', () => { void work(); }); },
  };
}

export function mount(selector: string, initialize: (root: HTMLElement) => Promise<void>): void {
  document.querySelectorAll<HTMLElement>(selector).forEach(root => {
    if (root.dataset.mounted) return;
    root.dataset.mounted = 'true';
    void initialize(root).catch(reason => accountUI(root).fail(reason)).finally(() => {
      root.querySelectorAll<HTMLFieldSetElement>('fieldset[data-client-fields]').forEach(fields => { fields.disabled = false; });
      root.dataset.accountReady = 'true';
    });
  });
}
