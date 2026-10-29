import { authClient } from '../../lib/auth-client';
import { accountUI, action, data, element, mount } from './ui';

mount('[data-manager="organizations"]', async root => {
  const ui = accountUI(root);
  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const details = root.querySelector<HTMLElement>('[data-details]')!;
  const membersList = root.querySelector<HTMLElement>('[data-members]')!;
  const invitesList = root.querySelector<HTMLElement>('[data-invitations]')!;
  const management = root.querySelector<HTMLElement>('[data-management]')!;
  const creating = root.querySelector<HTMLFormElement>('[data-organization-create]')!;
  const inviting = root.querySelector<HTMLFormElement>('[data-organization-invite]')!;
  let selected: { id: string; name: string } | undefined;
  let userId = '';
  let generation = 0;
  let selecting = false;
  const selectButtons = () => root.querySelectorAll<HTMLButtonElement>('[data-organization-select]');

  async function loadDetails(org: { id: string; name: string }) {
    const ticket = ++generation;
    membersList.replaceChildren(); invitesList.replaceChildren(); management.hidden = true;
    root.querySelector<HTMLElement>('[data-readonly]')!.hidden = true;
    root.querySelector<HTMLElement>('[data-organization-heading]')!.textContent = org.name;
    details.hidden = false;
    const loading = root.querySelector<HTMLElement>('[data-detail-loading]')!; loading.hidden = false;
    try {
      const response = data(await authClient.organization.listMembers({ query: { organizationId: org.id } }));
      if (ticket !== generation || selected?.id !== org.id) return;
      const ownRole = response.members.find(member => member.user.id === userId)?.role;
      const canManage = ownRole === 'owner' || ownRole === 'admin';
      management.hidden = !canManage;
      root.querySelector<HTMLElement>('[data-readonly]')!.hidden = canManage;
      for (const member of response.members) {
        const row = element('li', 'account-row');
        const copy = element('div', 'account-row-copy');
        copy.append(element('strong', '', member.user.name || member.user.email), element('p', 'account-hint', `${member.user.email} · ${member.role}`));
        row.append(copy);
        if (canManage && member.role !== 'owner' && member.user.id !== userId) {
          const remove = action('Quitar miembro', button => {
            if (!window.confirm('¿Quitar a esta persona de la organización?')) return;
            void ui.perform(button, async () => {
              data(await authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId: org.id }));
              if (selected?.id === org.id) await loadDetails(org);
            }, 'Miembro retirado.');
          }, 'data-member-remove');
          remove.classList.add('is-danger'); row.append(remove);
        }
        membersList.append(row);
      }
      if (canManage) {
        const invitations = data(await authClient.organization.listInvitations({ query: { organizationId: org.id } }));
        if (ticket !== generation || selected?.id !== org.id) return;
        const pending = invitations.filter(invitation => invitation.status === 'pending');
        root.querySelector<HTMLElement>('[data-no-invitations]')!.hidden = pending.length !== 0;
        for (const invitation of pending) {
          const row = element('li', 'account-row');
          const copy = element('div', 'account-row-copy');
          copy.append(element('strong', '', invitation.email), element('p', 'account-hint', invitation.role));
          const cancel = action('Cancelar invitación', button => {
            if (!window.confirm('¿Cancelar esta invitación?')) return;
            void ui.perform(button, async () => {
              data(await authClient.organization.cancelInvitation({ invitationId: invitation.id }));
              if (selected?.id === org.id) await loadDetails(org);
            }, 'Invitación cancelada.');
          }, 'data-invitation-cancel');
          row.append(copy, cancel); invitesList.append(row);
        }
      }
    } finally { if (ticket === generation) loading.hidden = true; }
  }

  async function load() {
    empty.hidden = true;
    return ui.load(async () => {
      const [orgResponse, sessionResponse] = await Promise.all([authClient.organization.list(), authClient.getSession()]);
      userId = data(sessionResponse).user.id;
      const organizations = data(orgResponse);
      list.replaceChildren(); empty.hidden = organizations.length !== 0;
      for (const org of organizations) {
        const row = element('li', 'account-row');
        const copy = element('div', 'account-row-copy'); copy.append(element('strong', '', org.name), element('p', 'account-hint', org.slug));
        const select = action('Abrir', button => {
          if (selecting) return;
          void ui.perform(button, async () => {
            selecting = true; selectButtons().forEach(item => { if (item !== button) item.disabled = true; });
            try {
              data(await authClient.organization.setActive({ organizationId: org.id }));
              selected = org;
              selectButtons().forEach(item => item.setAttribute('aria-pressed', String(item === button)));
              await loadDetails(org);
            } finally { selecting = false; selectButtons().forEach(item => { if (item !== button) item.disabled = false; }); }
          }, 'Organización seleccionada.');
        }, 'data-organization-select');
        select.setAttribute('aria-label', `Abrir ${org.name}`);
        select.setAttribute('aria-pressed', String(selected?.id === org.id));
        row.append(copy, select); list.append(row);
      }
      selected = organizations.find(org => org.id === selected?.id);
      if (selected) await loadDetails(selected);
      else { ++generation; details.hidden = true; membersList.replaceChildren(); invitesList.replaceChildren(); }
    });
  }
  creating.addEventListener('submit', event => {
    event.preventDefault();
    const name = creating.elements.namedItem('name') as HTMLInputElement;
    const slug = creating.elements.namedItem('slug') as HTMLInputElement;
    if (!name.value.trim() || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.value)) { ui.fail(new Error('Escribe un nombre y un identificador válido.')); return; }
    void ui.perform(creating.querySelector<HTMLButtonElement>('[type="submit"]')!, async () => {
      const org = data(await authClient.organization.create({ name: name.value.trim(), slug: slug.value, keepCurrentActiveOrganization: false }));
      selected = org; creating.reset(); await load();
    }, 'Organización creada.');
  });
  inviting.addEventListener('submit', event => {
    event.preventDefault();
    if (!selected || management.hidden) return;
    const org = selected;
    const email = inviting.elements.namedItem('email') as HTMLInputElement;
    const role = inviting.elements.namedItem('role') as HTMLSelectElement;
    void ui.perform(inviting.querySelector<HTMLButtonElement>('[type="submit"]')!, async () => {
      data(await authClient.organization.inviteMember({ organizationId: org.id, email: email.value.trim(), role: role.value === 'admin' ? 'admin' : 'member' }));
      if (selected?.id === org.id) { inviting.reset(); await loadDetails(org); }
    }, 'Invitación creada. Puedes consultarla en las invitaciones pendientes.');
  });
  ui.retry(load); await load();
});
