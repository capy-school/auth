import { authClient } from '../../lib/auth-client';
import { accountUI, action, data, dateLabel, element, mount } from './ui';

mount('[data-manager="api-keys"]', async root => {
  const ui = accountUI(root);
  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const form = root.querySelector<HTMLFormElement>('[data-api-key-form]')!;
  const name = form.elements.namedItem('name') as HTMLInputElement;
  const create = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const panel = root.querySelector<HTMLElement>('[data-new-key]')!;
  const value = root.querySelector<HTMLElement>('[data-key-value]')!;
  async function load() {
    empty.hidden = true;
    return ui.load(async () => {
      const keys = data(await authClient.apiKey.list());
      list.replaceChildren(); empty.hidden = keys.length !== 0;
      for (const key of keys) {
        const row = element('li', 'account-row');
        const copy = element('div', 'account-row-copy');
        copy.append(element('strong', '', key.name || 'Sin nombre'), element('code', 'account-mask', '••••••••'), element('p', 'account-hint', `Creada: ${dateLabel(key.createdAt)} · ${key.enabled ? 'Habilitada' : 'Deshabilitada'}`));
        const remove = action('Revocar', button => {
          if (!window.confirm('¿Revocar esta clave? Las aplicaciones que la usan dejarán de tener acceso.')) return;
          void ui.perform(button, async () => { data(await authClient.apiKey.delete({ keyId: key.id })); await load(); name.focus(); }, 'Clave revocada.');
        }, 'data-key-delete');
        remove.classList.add('is-danger'); row.append(copy, remove); list.append(row);
      }
    });
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!panel.hidden) { panel.focus(); return; }
    if (!name.value.trim()) { ui.fail(new Error('Escribe un nombre para la integración.')); return; }
    void ui.perform(create, async () => {
      const created = data(await authClient.apiKey.create({ name: name.value.trim(), expiresIn: 60 * 60 * 24 * 365 }));
      if (!created.key) throw new Error('El servidor no devolvió la clave. Revisa el listado antes de volver a crearla.');
      value.textContent = created.key; panel.hidden = false; form.reset(); panel.focus();
      await load();
    }, 'Clave creada. Guárdala antes de salir.').then(() => { create.disabled = !panel.hidden; });
  });
  root.querySelector<HTMLButtonElement>('[data-copy-key]')!.addEventListener('click', event => {
    void ui.perform(event.currentTarget as HTMLButtonElement, async () => {
      try { await navigator.clipboard.writeText(value.textContent || ''); }
      catch { throw new Error('No se ha podido copiar. Selecciona la clave y cópiala manualmente antes de cerrar esta sección.'); }
    }, 'Clave copiada.');
  });
  root.querySelector<HTMLButtonElement>('[data-dismiss-key]')!.addEventListener('click', () => {
    value.textContent = ''; panel.hidden = true; create.disabled = false; name.focus();
  });
  ui.retry(load); await load();
});
