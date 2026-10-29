import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { dashboardFixture } from './helpers/dashboard-fixture.mjs';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';
import { accountState } from './helpers/account-state.mjs';

let fixture, browser, base;
before(async () => { fixture = await dashboardFixture(); base = new URL(await fixture.listen()).origin; browser = await dashboardChrome(); });
after(async () => { try { await browser?.close(); } finally { await fixture?.close(); } });
const evaluate = expression => browser.evaluate(expression);
async function wait(expression) {
  return evaluate(`new Promise((resolve,reject)=>{let tries=0;const check=()=>{if(${expression})return resolve(true);if(++tries>180)return reject(new Error('Condition not met: '+${JSON.stringify(expression)}));requestAnimationFrame(check)};check()})`);
}
async function visit(path, extra = '') {
  await browser.navigate(base + path, accountState + extra);
  await wait(`[...document.querySelectorAll('[data-manager]')].every(root=>root.dataset.accountReady==='true')`);
}
const submit = (form, values) => evaluate(`{const form=document.querySelector(${JSON.stringify(form)});for(const [name,value]of Object.entries(${JSON.stringify(values)}))form.elements.namedItem(name).value=value;form.requestSubmit()}`);

test('summary shows real transport sessions, never tokens or old notes', async () => {
  await visit('/dashboard');
  assert.equal(await evaluate(`document.querySelectorAll('[data-manager="sessions"] .account-row').length`), 2);
  assert.match(await evaluate(`document.querySelector('[data-manager="sessions"]').textContent`), /Sesión actual/);
  assert.equal(await evaluate(`document.body.innerHTML.includes('opaque-current-token')||document.body.innerHTML.includes('opaque-other-token')`), false);
  assert.equal(await evaluate(`document.querySelectorAll('[data-notes]').length`), 0);
});
test('sessions only revoke another session after confirmation', async () => {
  await visit('/settings/sessions');
  assert.equal(await evaluate(`document.querySelectorAll('[data-session-revoke]').length`), 1);
  await evaluate(`window.confirm=()=>false;document.querySelector('[data-session-revoke]').click()`);
  assert.equal(await evaluate(`__calls.filter(c=>c.method==='revokeSession').length`), 0);
  await evaluate(`window.confirm=()=>true;document.querySelector('[data-session-revoke]').click()`);
  await wait(`document.querySelectorAll('.account-row').length===1`);
  assert.deepEqual(await evaluate(`__calls.find(c=>c.method==='revokeSession').arg`), { token: 'opaque-other-token' });
  assert.match(await evaluate(`document.querySelector('[data-status]').textContent`), /cerrada/);
});

test('revocation returns keyboard focus to stable feedback instead of the removed button', async () => {
  await visit('/settings/sessions');
  await evaluate(`window.confirm=()=>true;const button=document.querySelector('[data-session-revoke]');button.focus();button.click()`);
  await wait(`document.querySelectorAll('.account-row').length===1`);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('[data-status]')`), true);
});
test('failed session loads are distinct from empty and can be retried', async () => {
  await visit('/settings/sessions', `window.__failMethod='listSessions';`);
  assert.equal(await evaluate(`document.querySelector('[data-error]').hidden`), false);
  assert.equal(await evaluate(`document.querySelector('[data-empty]').hidden`), true);
  await evaluate(`window.__failMethod=null;document.querySelector('[data-retry]').click()`);
  await wait(`document.querySelectorAll('.account-row').length===2`);
  await visit('/settings/sessions', `window.__sessions=[];`);
  assert.equal(await evaluate(`document.querySelector('[data-empty]').hidden`), false);
});
test('passkeys support registration, inline rename and confirmed deletion', async () => {
  await visit('/settings/passkey');
  await submit('[data-passkey-form]', { name: 'Móvil' });
  await wait(`document.querySelectorAll('.account-row').length===2`);
  await evaluate(`document.querySelector('[data-passkey-rename]').click()`);
  await submit('[data-passkey-rename-form]', { name: 'Portátil nuevo' });
  await wait(`document.querySelector('.account-list').textContent.includes('Portátil nuevo')`);
  await evaluate(`window.confirm=()=>true;document.querySelector('[data-passkey-delete]').click()`);
  await wait(`document.querySelectorAll('.account-row').length===1`);
});
test('API keys render hostile names inertly and retain one-time value after clipboard failure', async () => {
  await visit('/settings/api-keys');
  assert.equal(await evaluate(`document.querySelectorAll('.account-list img').length`), 0);
  assert.match(await evaluate(`document.querySelector('.account-list').textContent`), /<img src=x/);
  await submit('[data-api-key-form]', { name: 'Integración' });
  await wait(`!document.querySelector('[data-new-key]').hidden`);
  await evaluate(`Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}}});document.querySelector('[data-copy-key]').click()`);
  await wait(`document.querySelector('[data-error]').textContent.includes('copiar')`);
  assert.equal(await evaluate(`document.querySelector('[data-key-value]').textContent`), 'fictional-one-time-key');
  await evaluate(`document.querySelector('[data-dismiss-key]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-key-value]').textContent`), '');
  await evaluate(`window.confirm=()=>true;document.querySelector('[data-key-delete]').click()`);
  await wait(`document.querySelectorAll('.account-row').length===1`);
});
test('passwordless accounts never get a simulated 2FA activation', async () => {
  await visit('/settings/2fa', `window.__credential=false;localStorage.setItem('2fa_enabled','true');`);
  assert.match(await evaluate(`document.querySelector('[data-manager="two-factor"]').textContent`), /sin contraseña/);
  assert.equal(await evaluate(`document.querySelector('[data-two-factor-form]').hidden`), true);
  assert.match(await evaluate(`document.querySelector('[data-two-factor-state]').textContent`), /No activada/);
});
test('2FA accepts only server verification and keeps backup codes until acknowledged', async () => {
  await visit('/settings/2fa');
  await submit('[data-two-factor-form]', { password: 'fictional-password' });
  await wait(`!document.querySelector('[data-two-factor-verify]').hidden`);
  await wait(`document.querySelector('[data-totp-qr]').naturalWidth>0`);
  assert.equal(await evaluate(`document.querySelector('[data-totp-secret]').textContent`), 'JBSWY3DPEHPK3PXP');
  await submit('[data-two-factor-verify]', { code: '000000' });
  await wait(`document.querySelector('[data-error]').textContent.includes('Código no válido')`);
  assert.match(await evaluate(`document.querySelector('[data-two-factor-state]').textContent`), /No activada/);
  await submit('[data-two-factor-verify]', { code: '123456' });
  await wait(`document.querySelector('[data-two-factor-state]').textContent.includes('Activada')`);
  assert.match(await evaluate(`document.querySelector('[data-backup-codes]').textContent`), /fictional-backup-one/);
  await evaluate(`document.querySelector('[data-backup-saved]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-backup-codes]').textContent`), '');
  await evaluate(`window.confirm=()=>true`);
  await submit('[data-two-factor-disable]', { password: 'fictional-password' });
  await wait(`document.querySelector('[data-two-factor-state]').textContent.includes('No activada')`);
});
test('organizations create and scope member/invitation operations to the selected team', async () => {
  await visit('/settings/organizations');
  await submit('[data-organization-create]', { name: 'Equipo nuevo', slug: 'equipo-nuevo' });
  await wait(`document.querySelectorAll('[data-organization-select]').length===3`);
  await evaluate(`document.querySelectorAll('[data-organization-select]')[1].click()`);
  await wait(`document.querySelector('[data-members]').textContent.includes('org-b')`);
  await submit('[data-organization-invite]', { email: 'new@example.invalid', role: 'member' });
  await wait(`__calls.some(c=>c.method==='organization.inviteMember')`);
  assert.equal(await evaluate(`__calls.find(c=>c.method==='organization.inviteMember').arg.organizationId`), 'org-b');
  await evaluate(`window.confirm=()=>true;document.querySelector('[data-member-remove]').click()`);
  await wait(`__calls.some(c=>c.method==='organization.removeMember')`);
  assert.equal(await evaluate(`__calls.find(c=>c.method==='organization.removeMember').arg.organizationId`), 'org-b');
  await evaluate(`document.querySelector('[data-invitation-cancel]').click()`);
  await wait(`__calls.some(c=>c.method==='organization.cancelInvitation')`);
});

test('a failed revoke keeps the other session visible and reports no success', async () => {
  await visit('/settings/sessions', `window.__failMethod='revokeSession';`);
  await evaluate(`window.confirm=()=>true;document.querySelector('[data-session-revoke]').click()`);
  await wait(`!document.querySelector('[data-error]').hidden`);
  assert.equal(await evaluate(`document.querySelectorAll('.account-row').length`), 2);
  assert.equal(await evaluate(`document.querySelector('[data-status]').textContent`), '');
  assert.equal(await evaluate(`document.querySelector('[data-session-revoke]').disabled`), false);
});
test('cancelled passkey registration preserves the draft and shows the server error', async () => {
  await visit('/settings/passkey', `window.__failMethod='passkey.addPasskey';`);
  await submit('[data-passkey-form]', { name: 'Sin guardar' });
  await wait(`!document.querySelector('[data-error]').hidden`);
  assert.equal(await evaluate(`document.querySelector('#passkey-name').value`), 'Sin guardar');
  assert.equal(await evaluate(`document.querySelectorAll('.account-row').length`), 1);
});
test('failed key creation never shows a generated secret and keeps the draft', async () => {
  await visit('/settings/api-keys', `window.__failMethod='apiKey.create';`);
  await submit('[data-api-key-form]', { name: 'Borrador' });
  await wait(`!document.querySelector('[data-error]').hidden`);
  assert.equal(await evaluate(`document.querySelector('[data-new-key]').hidden`), true);
  assert.equal(await evaluate(`document.querySelector('#api-key-name').value`), 'Borrador');
});
test('new API keys retain the existing one-year expiration policy', async () => {
  await visit('/settings/api-keys');
  await submit('[data-api-key-form]', { name: 'Integración anual' });
  await wait(`!document.querySelector('[data-new-key]').hidden`);
  assert.equal(await evaluate(`__calls.find(call=>call.method==='apiKey.create').arg.expiresIn`), 60 * 60 * 24 * 365);
});
test('failed 2FA disable leaves server-confirmed protection active', async () => {
  await visit('/settings/2fa', `window.__twoFactor=true;window.__failMethod='twoFactor.disable';window.confirm=()=>true;`);
  await submit('[data-two-factor-disable]', { password: 'fictional-password' });
  await wait(`!document.querySelector('[data-error]').hidden`);
  assert.match(await evaluate(`document.querySelector('[data-two-factor-state]').textContent`), /^Activada:/);
  assert.equal(await evaluate(`document.querySelector('#two-factor-disable-password').value`), '');
});
test('read-only organization members never get invitation/removal controls', async () => {
  await visit('/settings/organizations', `const original=window.__accountCall;window.__accountCall=async(method,arg)=>{const result=await original(method,arg);if(method==='organization.listMembers')result.data.members[0].role='member';return result};`);
  await evaluate(`document.querySelector('[data-organization-select]').click()`);
  await wait(`!document.querySelector('[data-readonly]').hidden`);
  assert.equal(await evaluate(`document.querySelector('[data-management]').hidden`), true);
  assert.equal(await evaluate(`document.querySelectorAll('[data-member-remove]').length`), 0);
  assert.equal(await evaluate(`__calls.some(call=>call.method==='organization.listInvitations')`), false);
});
test('organization selection locks other selectors while details are in flight', async () => {
  await visit('/settings/organizations', `const original=window.__accountCall;window.__accountCall=async(method,arg)=>{const result=await original(method,arg);if(method==='organization.listMembers'&&arg.query.organizationId==='org-a')return new Promise(resolve=>window.__finishMembers=()=>resolve(result));return result};`);
  await evaluate(`document.querySelector('[data-organization-select]').click()`);
  await wait(`typeof window.__finishMembers==='function'`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-organization-select]')[1].disabled`), true);
  assert.equal(await evaluate(`document.querySelector('[data-members]').children.length`), 0);
  await evaluate(`window.__finishMembers()`);
  await wait(`!document.querySelectorAll('[data-organization-select]')[1].disabled`);
  assert.match(await evaluate(`document.querySelector('[data-members]').textContent`), /org-a/);
});
test('pending TOTP verification cannot be cancelled and lose recovery material', async () => {
  await visit('/settings/2fa', `const original=window.__accountCall;window.__accountCall=async(method,arg)=>{const result=await original(method,arg);if(method==='twoFactor.verifyTotp')return new Promise(resolve=>window.__finishVerification=()=>resolve(result));return result};`);
  await submit('[data-two-factor-form]', { password: 'fictional-password' });
  await wait(`!document.querySelector('[data-two-factor-verify]').hidden`);
  await submit('[data-two-factor-verify]', { code: '123456' });
  await wait(`typeof window.__finishVerification==='function'`);
  const locked = await evaluate(`document.querySelector('[data-two-factor-cancel]').disabled`);
  await evaluate(`document.querySelector('[data-two-factor-cancel]').click();window.__finishVerification()`);
  await wait(`document.querySelector('[data-two-factor-state]').textContent.startsWith('Activada:')`);
  assert.equal(locked, true);
  assert.match(await evaluate(`document.querySelector('[data-backup-codes]').textContent`), /fictional-backup-one/);
});
test('an uncertain verification result retains recovery codes until server reconciliation', async () => {
  await visit('/settings/2fa', `const original=window.__accountCall;window.__accountCall=async(method,arg)=>{const result=await original(method,arg);if(method==='twoFactor.verifyTotp')window.__failMethod='getSession';return result};`);
  await submit('[data-two-factor-form]', { password: 'fictional-password' });
  await wait(`!document.querySelector('[data-two-factor-verify]').hidden`);
  await submit('[data-two-factor-verify]', { code: '123456' });
  await wait(`!document.querySelector('[data-error]').hidden`);
  assert.equal(await evaluate(`document.querySelector('[data-two-factor-cancel]').disabled`), true);
  assert.match(await evaluate(`document.querySelector('[data-backup-codes]').textContent`), /fictional-backup-one/);
  assert.equal(await evaluate(`document.querySelector('[data-retry]').hidden`), false);
  await evaluate(`window.__failMethod=null;document.querySelector('[data-retry]').click()`);
  await wait(`document.querySelector('[data-two-factor-state]').textContent.startsWith('Activada:')`);
  assert.match(await evaluate(`document.querySelector('[data-backup-codes]').textContent`), /fictional-backup-one/);
});
test('an inactive read after a transport failure cannot discard a still-pending activation', async () => {
  await visit('/settings/2fa', `const original=window.__accountCall;window.__accountCall=async(method,arg)=>{if(method==='twoFactor.verifyTotp'){window.__commitLater=()=>window.__twoFactor=true;throw new Error('Response lost while server is processing')};return original(method,arg)};`);
  await submit('[data-two-factor-form]', { password: 'fictional-password' });
  await wait(`!document.querySelector('[data-two-factor-verify]').hidden`);
  await submit('[data-two-factor-verify]', { code: '123456' });
  await wait(`!document.querySelector('[data-error]').hidden`);
  const locked = await evaluate(`document.querySelector('[data-two-factor-cancel]').disabled`);
  await evaluate(`document.querySelector('[data-two-factor-cancel]').click()`);
  const material = await evaluate(`document.querySelector('[data-backup-codes]').textContent`);
  await evaluate(`document.querySelector('[data-retry]').click()`);
  await wait(`__calls.filter(call=>call.method==='getSession').length>=3&&document.querySelector('[data-manager]').getAttribute('aria-busy')==='false'`);
  const lockedAfterInactiveRetry = await evaluate(`document.querySelector('[data-two-factor-cancel]').disabled`);
  await evaluate(`window.__commitLater()`);
  assert.equal(locked, true);
  assert.equal(lockedAfterInactiveRetry, true);
  assert.match(material, /fictional-backup-one/);
  await evaluate(`document.querySelector('[data-retry]').click()`);
  await wait(`document.querySelector('[data-two-factor-state]').textContent.startsWith('Activada:')`);
  assert.match(await evaluate(`document.querySelector('[data-backup-codes]').textContent`), /fictional-backup-one/);
});
