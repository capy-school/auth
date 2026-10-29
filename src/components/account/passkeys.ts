import { authClient } from '../../lib/auth-client';
import { accountUI, action, data, dateLabel, element, mount } from './ui';

mount('[data-manager="passkeys"]', async root => {
  const ui = accountUI(root);
  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const form = root.querySelector<HTMLFormElement>('[data-passkey-form]')!;
  const name = form.elements.namedItem('name') as HTMLInputElement;
  async function load() {
    empty.hidden = true;
    return ui.load(async () => {
      const passkeys = data(await authClient.passkey.listUserPasskeys());
      list.replaceChildren();
      empty.hidden = passkeys.length !== 0;
      passkeys.forEach((passkey, index) => {
        const row = element('li', 'account-row');
        const copy = element('div', 'account-row-copy');
        copy.append(element('strong', '', passkey.name || 'Dispositivo sin nombre'), element('p', 'account-hint', `Añadida: ${dateLabel(passkey.createdAt)}`));
        const actions = element('div', 'account-actions');
        const rename = action('Renombrar', () => {
          const existing = row.querySelector<HTMLInputElement>('input');
          if (existing) { existing.focus(); return; }
          const edit = element('form', 'account-inline-form');
          edit.setAttribute('data-passkey-rename-form', '');
          const input = element('input');
          input.name = 'name'; input.required = true; input.maxLength = 100;
          input.id = `rename-passkey-${index}`; input.value = passkey.name || '';
          const label = element('label', '', 'Nuevo nombre'); label.htmlFor = input.id;
          const save = element('button', 'account-button is-primary', 'Guardar'); save.type = 'submit';
          const cancel = action('Cancelar', () => { edit.remove(); rename.focus(); });
          edit.append(label, input, save, cancel);
          edit.addEventListener('submit', event => {
            event.preventDefault();
            if (!input.value.trim()) { ui.fail(new Error('Escribe un nombre para el dispositivo.')); return; }
            void ui.perform(save, async () => {
              data(await authClient.passkey.updatePasskey({ id: passkey.id, name: input.value.trim() }));
              await load(); name.focus();
            }, 'Nombre actualizado.');
          });
          row.append(edit); input.focus();
        }, 'data-passkey-rename');
        const remove = action('Eliminar', button => {
          if (!window.confirm('¿Eliminar esta passkey? Necesitarás otro método para acceder.')) return;
          void ui.perform(button, async () => {
            const result = await authClient.passkey.deletePasskey({ id: passkey.id });
            // This endpoint legitimately returns JSON null with HTTP 200.
            if (result.error) data(result);
            await load(); name.focus();
          }, 'Passkey eliminada.');
        }, 'data-passkey-delete');
        remove.classList.add('is-danger');
        actions.append(rename, remove); row.append(copy, actions); list.append(row);
      });
    });
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!name.value.trim()) { ui.fail(new Error('Escribe un nombre para el dispositivo.')); return; }
    void ui.perform(form.querySelector<HTMLButtonElement>('[type="submit"]')!, async () => {
      // Better Auth 1.3 returns undefined after a successful WebAuthn ceremony,
      // but returns an error response when registration fails or is cancelled.
      const result = await authClient.passkey.addPasskey({ name: name.value.trim() });
      if (result?.error) data(result);
      form.reset(); await load(); name.focus();
    }, 'Passkey añadida.');
  });
  ui.retry(load); await load();
});
