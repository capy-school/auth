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
