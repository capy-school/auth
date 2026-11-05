import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { kitStaticFixture } from './helpers/kit-static-fixture.mjs';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';

let fixture, browser;
before(async () => { fixture = await kitStaticFixture(); browser = await dashboardChrome(); });
after(async () => { try { await browser?.close(); } finally { await fixture?.close(); } });
const evaluate = expression => browser.evaluate(expression);
const preload = `localStorage.clear();window.__alerts=[];window.alert=message=>window.__alerts.push(String(message));window.confirm=()=>true;`;
async function wait(expression) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await evaluate(`new Promise((resolve,reject)=>{const end=performance.now()+10000;const check=()=>{if(${expression})return resolve(true);if(performance.now()>end)return reject(new Error('Condition not met: '+${JSON.stringify(expression)}));requestAnimationFrame(check)};check()})`);
    } catch (error) {
      if (!/Execution context was destroyed|Inspected target navigated|Cannot find context/.test(error.message)) throw error;
    }
  }
  assert.fail('Browser did not settle after navigation');
}
async function visit(path = '/') {
  await browser.navigate(fixture.origin + path, preload);
}
async function loginReady() {
  await wait(`document.querySelector('.portal-login')?.getAttribute('aria-busy')==='false'`);
}
async function clickLink(path) {
  await evaluate(`(()=>{const link=Array.from(document.querySelectorAll('a')).find(a=>new URL(a.href).pathname.replace(/[/]$/,'')===${JSON.stringify(path.replace(/\/$/, ''))});if(!link)throw new Error('Missing navigation link: '+${JSON.stringify(path)});link.click()})()`);
  await wait(`location.pathname.replace(/[/]$/,'')===${JSON.stringify(path.replace(/\/$/, ''))}`);
}
async function managerReady(name) {
  await wait(`document.querySelector('[data-manager=${JSON.stringify(name)}]')?.dataset.accountReady==='true'`);
}

test('real Kit prerender contains approved markup but no profile data or usable pre-hydration email', async () => {
  const response = await fixture.request('/');
  const html = await response.text();
  assert.match(html, /<html lang="es">/);
  assert.match(html, /class="login-page"/);
  assert.match(html, /portal-art/);
  assert.match(html, /<form[^>]*method="post"/);
  assert.match(html, /<input[^>]*type="email"[^>]*disabled/);
  assert.doesNotMatch(html, /authentication is not connected|John Doe|john\.doe/);
  const dashboard = await (await fixture.request('/dashboard/')).text();
  assert.match(dashboard, /Cuenta y seguridad/);
  assert.doesNotMatch(dashboard, /John Doe|john\.doe|kit-browser@example/);
  await browser.page('Emulation.setScriptExecutionDisabled', { value: true });
  try {
    await visit('/');
    assert.equal(await evaluate(`document.querySelector('input[type=email]').disabled`), true);
    assert.equal(await evaluate(`document.querySelector('.email-form').method`), 'post');
    assert.equal(await evaluate(`location.search`), '');
  } finally { await browser.page('Emulation.setScriptExecutionDisabled', { value: false }); }
});

test('session errors and malformed JSON never mount managers; retry reaches the real anonymous login', async () => {
  const count = fixture.requests.filter(request => request.path === '/api/auth/list-sessions').length;
  fixture.overrideSession(503);
  try {
    await visit('/dashboard/');
    await wait(`Array.from(document.querySelectorAll('button')).some(button=>/Reintentar|Volver a intentar/i.test(button.textContent)&&!button.disabled)`);
    assert.equal(fixture.requests.filter(request => request.path === '/api/auth/list-sessions').length, count);
    assert.equal(await evaluate(`document.querySelector('[data-manager="sessions"]')?.dataset.accountReady==='true'`), false);
    fixture.overrideSession(200, 'malformed JSON');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>/Reintentar|Volver a intentar/i.test(button.textContent)).click()`);
    await wait(`Array.from(document.querySelectorAll('button')).some(button=>/Reintentar|Volver a intentar/i.test(button.textContent)&&!button.disabled)`);
    assert.equal(fixture.requests.filter(request => request.path === '/api/auth/list-sessions').length, count);
  } finally { fixture.overrideSession(null); }
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>/Reintentar|Volver a intentar/i.test(button.textContent)).click()`);
  await loginReady();
  assert.equal(await evaluate('location.pathname'), '/');
});

test('static bundle signs in with a real magic link, uses real account mutations through SPA and signs out', async () => {
  await visit('/');
  await loginReady();
  await evaluate(`document.querySelector('#login-email').focus()`);
  await browser.page('Input.insertText', { text: 'kit-browser@example.invalid' });
  const sent = fixture.waitForResponse('/api/auth/sign-in/magic-link');
  await evaluate(`document.querySelector('.email-form').requestSubmit()`);
  assert.equal((await sent).status, 200);
  const message = fixture.inbox.list().find(item => item.email === 'kit-browser@example.invalid');
  assert.ok(message, 'Real Better Auth must write the magic link, not simulate a success');
  const body = JSON.parse(fixture.requests.findLast(request => request.path === '/api/auth/sign-in/magic-link').body);
  assert.equal(body.email, 'kit-browser@example.invalid');
  assert.equal(new URL(body.callbackURL, fixture.origin).pathname.replace(/\/$/, ''), '/dashboard');
  await browser.navigate(message.url, preload);
  await managerReady('sessions');
  assert.match(await evaluate(`document.querySelector('.dashboard-profile').textContent`), /kit-browser@example.invalid/);
  assert.doesNotMatch(await evaluate('document.cookie'), /session_token/);
  await evaluate(`window.__sameDocument='kit-spa-marker'`);

  await clickLink('/settings/api-keys');
  await managerReady('api-keys');
  assert.equal(await evaluate('window.__sameDocument'), 'kit-spa-marker');
  await evaluate(`document.querySelector('[data-api-key-form] input').value='Kit <literal> integration'`);
  const created = fixture.waitForResponse('/api/auth/api-key/create');
  await evaluate(`document.querySelector('[data-api-key-form]').requestSubmit()`);
  assert.equal((await created).status, 200);
  await wait(`document.querySelector('[data-new-key]')?.hidden===false&&document.querySelector('[data-key-value]').textContent.length>10`);
  const secret = await evaluate(`document.querySelector('[data-key-value]').textContent`);
  assert.equal(await evaluate(`JSON.stringify(localStorage).includes(${JSON.stringify(secret)})`), false);
  assert.equal(await evaluate(`document.querySelector('[data-list]').querySelector('literal')`), null);
  await evaluate(`document.querySelector('[data-dismiss-key]').click()`);

  await clickLink('/settings/sessions');
  await managerReady('sessions');
  assert.match(await evaluate(`document.querySelector('[data-list]').textContent`), /Sesión actual/);
  await clickLink('/settings/security');
  await wait(`document.querySelector('[data-account-protected]')?.hidden===false`);
  await clickLink('/settings/api-keys');
  await managerReady('api-keys');
  assert.equal(await evaluate('window.__sameDocument'), 'kit-spa-marker');
  assert.match(await evaluate(`document.querySelector('[data-list]').textContent`), /Kit <literal> integration/);
  const before = fixture.requests.filter(request => request.path === '/api/auth/api-key/create').length;
  await evaluate(`document.querySelector('[data-api-key-form] input').value='Second SPA visit'`);
  const second = fixture.waitForResponse('/api/auth/api-key/create');
  await evaluate(`document.querySelector('[data-api-key-form]').requestSubmit()`);
  assert.equal((await second).status, 200);
  assert.equal(fixture.requests.filter(request => request.path === '/api/auth/api-key/create').length, before + 1);
  await wait(`document.querySelector('[data-new-key]')?.hidden===false`);
  await evaluate(`document.querySelector('[data-dismiss-key]').click()`);

  await clickLink('/settings/organizations');
  await managerReady('organizations');
  await evaluate(`document.querySelector('#organization-name').value='Kit browser team';document.querySelector('#organization-slug').value='kit-browser-team'`);
  const team = fixture.waitForResponse('/api/auth/organization/create');
  await evaluate(`document.querySelector('[data-organization-create]').requestSubmit()`);
  assert.equal((await team).status, 200);
  await wait(`document.querySelector('[data-list]').textContent.includes('Kit browser team')`);
  await clickLink('/settings/security');
  await wait(`document.querySelector('[data-account-protected]')?.hidden===false`);
  await clickLink('/settings/2fa');
  await managerReady('two-factor');
  assert.equal(await evaluate(`document.querySelector('[data-passwordless]').hidden`), false);

  const signedOut = fixture.waitForResponse('/api/auth/sign-out');
  await evaluate(`Array.from(document.querySelectorAll('a')).find(a=>new URL(a.href).pathname.replace(/[/]$/,'')==='/logout').click()`);
  await wait(`document.querySelector('[data-sign-out]')?.disabled===false`);
  await evaluate(`document.querySelector('[data-sign-out]').click()`);
  assert.equal((await signedOut).status, 200);
  await loginReady();
  assert.equal(await evaluate(`fetch('/api/session',{cache:'no-store'}).then(response=>response.status)`), 401);
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(browser.exceptions, []);
});

test('compiled login A remains usable on desktop and mobile with invalid destinations blocked', async () => {
  await visit('/?app=unknown&redirect=https%3A%2F%2Fforeign.invalid');
  await loginReady();
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.portal-login button')).every(button=>button.disabled)`), true);
  await visit('/');
  await loginReady();
  for (const width of [1440, 360]) {
    await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    assert.equal(await evaluate(`document.querySelectorAll('[data-provider]').length`), 6);
    assert.equal(await evaluate(`document.querySelector('#login-email').disabled`), false);
  }
});
