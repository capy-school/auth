import QRCode from 'qrcode';
import { authClient } from '../../lib/auth-client';
import { accountUI, data, element, mount } from './ui';

mount('[data-manager="two-factor"]', async root => {
  const ui = accountUI(root);
  const state = root.querySelector<HTMLElement>('[data-two-factor-state]')!;
  const setup = root.querySelector<HTMLElement>('[data-two-factor-setup]')!;
  const start = root.querySelector<HTMLFormElement>('[data-two-factor-form]')!;
  const verify = root.querySelector<HTMLFormElement>('[data-two-factor-verify]')!;
  const disable = root.querySelector<HTMLFormElement>('[data-two-factor-disable]')!;
  const backupPanel = root.querySelector<HTMLElement>('[data-backup-panel]')!;
  const backups = root.querySelector<HTMLElement>('[data-backup-codes]')!;
  const secret = root.querySelector<HTMLElement>('[data-totp-secret]')!;
  const qr = root.querySelector<HTMLImageElement>('[data-totp-qr]')!;
  const cancel = root.querySelector<HTMLButtonElement>('[data-two-factor-cancel]')!;
  const verifyButton = verify.querySelector<HTMLButtonElement>('[type="submit"]')!;
  let enabled = false;
  let hasPassword = false;
  let verificationBusy = false;
  let verificationUncertain = false;
  function renderState() {
    state.textContent = enabled ? 'Activada: el servidor confirma tu segundo factor.' : 'No activada: el servidor no indica un segundo factor activo.';
    start.hidden = enabled || !hasPassword || !setup.hidden;
    disable.hidden = !enabled || !hasPassword;
    root.querySelector<HTMLElement>('[data-passwordless]')!.hidden = hasPassword;
  }
  function clearSetup() {
    setup.hidden = true; verify.hidden = true; verify.reset();
    secret.textContent = ''; qr.removeAttribute('src'); qr.hidden = true;
  }
  function retainUncertainVerification(): Error {
    verificationUncertain = true;
    cancel.disabled = true; verifyButton.disabled = true;
    state.textContent = 'Estado pendiente de confirmar en el servidor.';
    root.querySelector<HTMLElement>('[data-retry]')!.hidden = false;
    return new Error('No se puede confirmar que la solicitud haya terminado. Conservamos tus códigos: guárdalos antes de salir y vuelve a consultar el estado.');
  }
  async function load() {
    if (verificationBusy) return false;
    start.hidden = true; disable.hidden = true;
    return ui.load(async () => {
      const [sessionResponse, accountsResponse] = await Promise.all([
        authClient.getSession({ query: { disableCookieCache: true } }), authClient.listAccounts(),
      ]);
      enabled = !!data(sessionResponse).user.twoFactorEnabled;
      hasPassword = data(accountsResponse).some(account => account.providerId === 'credential');
      if (verificationUncertain) {
        // Inactive may be an interim read while an earlier request is still
        // committing. Only confirmed activation resolves an ambiguous outcome.
        if (!enabled) throw retainUncertainVerification();
        verificationUncertain = false;
        cancel.disabled = false;
        verifyButton.disabled = false;
        clearSetup();
      }
      renderState();
    });
  }
  start.addEventListener('submit', event => {
    event.preventDefault();
    if (!hasPassword || enabled || verificationBusy || verificationUncertain) return;
    const password = start.elements.namedItem('password') as HTMLInputElement;
    void ui.perform(start.querySelector<HTMLButtonElement>('[type="submit"]')!, async () => {
      let response;
      try { response = data(await authClient.twoFactor.enable({ password: password.value })); }
      finally { password.value = ''; }
      const uri = new URL(response.totpURI);
      const manual = uri.searchParams.get('secret');
      if (uri.protocol !== 'otpauth:' || !manual) throw new Error('El servidor no devolvió una configuración válida.');
      secret.textContent = manual; setup.hidden = false; verify.hidden = false;
      backups.replaceChildren(...response.backupCodes.map(code => { const item = element('li'); item.append(element('code', '', code)); return item; }));
      backupPanel.hidden = false; renderState();
      try { qr.src = await QRCode.toDataURL(response.totpURI, { width: 192, margin: 2 }); qr.hidden = false; }
      catch { ui.fail(new Error('No se ha podido generar el QR. Puedes continuar introduciendo la clave manual.')); }
      (verify.elements.namedItem('code') as HTMLInputElement).focus();
    }, 'Configuración recibida. Verifica el código para activarla.');
  });
  verify.addEventListener('submit', event => {
    event.preventDefault();
    if (setup.hidden || verificationBusy || verificationUncertain) return;
    const code = verify.elements.namedItem('code') as HTMLInputElement;
    verificationBusy = true;
    cancel.disabled = true;
    verify.setAttribute('aria-busy', 'true');
    void ui.perform(verifyButton, async () => {
      let failure: unknown;
      let definitiveRejection = false;
      try {
        const result = await authClient.twoFactor.verifyTotp({ code: code.value.trim() });
        if (result.error) {
          const errorCode = 'code' in result.error ? String(result.error.code) : '';
          definitiveRejection = result.error.status >= 400 && result.error.status < 500 && ['INVALID_CODE', 'INVALID_TWO_FACTOR_COOKIE', 'TOTP_NOT_ENABLED'].includes(errorCode);
          if (definitiveRejection && errorCode !== 'TOTP_NOT_ENABLED') throw new Error('Código no válido. Comprueba tu aplicación o vuelve a iniciar sesión.');
        }
        data(result);
      }
      catch (reason) { failure = reason; }
      // A lost response does not mean the server cancelled the mutation.
      // Reconcile before letting cancellation discard recovery material.
      try {
        enabled = !!data(await authClient.getSession({ query: { disableCookieCache: true } })).user.twoFactorEnabled;
      } catch {
        throw retainUncertainVerification();
      }
      if (!enabled) {
        if (!definitiveRejection) throw retainUncertainVerification();
        throw failure || new Error('El servidor ha rechazado la verificación.');
      }
      clearSetup(); renderState();
    }, 'Segundo factor activado y confirmado por el servidor.').finally(() => {
      verificationBusy = false;
      cancel.disabled = verificationUncertain;
      verifyButton.disabled = verificationUncertain;
      verify.setAttribute('aria-busy', 'false');
    });
  });
  disable.addEventListener('submit', event => {
    event.preventDefault();
    if (!hasPassword || !enabled || !window.confirm('¿Desactivar el segundo factor de esta cuenta?')) return;
    const password = disable.elements.namedItem('password') as HTMLInputElement;
    void ui.perform(disable.querySelector<HTMLButtonElement>('[type="submit"]')!, async () => {
      try { data(await authClient.twoFactor.disable({ password: password.value })); }
      finally { password.value = ''; }
      enabled = !!data(await authClient.getSession({ query: { disableCookieCache: true } })).user.twoFactorEnabled;
      if (enabled) throw new Error('El servidor todavía indica que el segundo factor está activado.');
      clearSetup(); backups.replaceChildren(); backupPanel.hidden = true; renderState();
    }, 'Segundo factor desactivado.');
  });
  cancel.addEventListener('click', () => {
    if (verificationBusy || verificationUncertain) return;
    clearSetup(); backups.replaceChildren(); backupPanel.hidden = true; renderState();
  });
  root.querySelector<HTMLButtonElement>('[data-backup-saved]')!.addEventListener('click', () => {
    backups.replaceChildren(); backupPanel.hidden = true;
  });
  ui.retry(load); await load();
});
