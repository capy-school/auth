import { authClient } from '../../lib/auth-client';
import { accountUI, action, data, dateLabel, element, mount } from './ui';

function deviceLabel(agent: string | null | undefined): string {
  const text = agent || '';
  const browser = /Edg\//.test(text) ? 'Edge' : /Firefox\//.test(text) ? 'Firefox' : /Chrome\//.test(text) ? 'Chrome' : /Safari\//.test(text) ? 'Safari' : 'Navegador no identificado';
  const system = /Android/.test(text) ? 'Android' : /iPhone|iPad/.test(text) ? 'iOS' : /Windows/.test(text) ? 'Windows' : /Macintosh|Mac OS/.test(text) ? 'macOS' : /Linux/.test(text) ? 'Linux' : '';
  return system ? `${browser} · ${system}` : browser;
}

mount('[data-manager="sessions"]', async root => {
  const ui = accountUI(root);
  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const summary = root.dataset.summary === 'true';
  async function load() {
    empty.hidden = true;
    list.replaceChildren();
    return ui.load(async () => {
      const [sessionsResponse, currentResponse] = await Promise.all([
        authClient.listSessions(), authClient.getSession({ query: { disableCookieCache: true } }),
      ]);
      const current = data(currentResponse).session.id;
      const sessions = [...data(sessionsResponse)].sort((a, b) => Number(b.id === current) - Number(a.id === current));
      empty.hidden = sessions.length !== 0;
      for (const session of summary ? sessions.slice(0, 3) : sessions) {
        const row = element('li', 'account-row');
        const copy = element('div', 'account-row-copy');
        const label = deviceLabel(session.userAgent);
        copy.append(element('strong', '', label), element('p', 'account-hint', `Creada: ${dateLabel(session.createdAt)}`));
        row.append(copy);
        if (session.id === current) row.append(element('span', 'dashboard-badge is-verified', 'Sesión actual'));
        else if (!summary) {
          const revoke = action('Cerrar sesión', button => {
            if (!window.confirm(`¿Cerrar la sesión de ${label}?`)) return;
            void ui.perform(button, async () => {
              data(await authClient.revokeSession({ token: session.token }));
              await load();
              root.querySelector<HTMLElement>('h2, [data-status]')?.focus();
            }, 'Sesión cerrada.');
          }, 'data-session-revoke');
          revoke.setAttribute('aria-label', `Cerrar sesión de ${label}`);
          row.append(revoke);
        }
        list.append(row);
      }
    });
  }
  ui.retry(load);
  await load();
});
