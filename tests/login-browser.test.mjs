import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { loginFixture } from './helpers/login-fixture.mjs';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';

let fixture, browser, base;
before(async () => { fixture = await loginFixture(); base = await fixture.listen(); browser = await dashboardChrome(); });
after(async () => { try { await browser?.close(); } finally { await fixture?.close(); } });
const evaluate = expression => browser.evaluate(expression);
const wait = expression => evaluate(`new Promise((resolve,reject)=>{let tries=0;const check=()=>{if(${expression})return resolve(true);if(++tries>300)return reject(new Error('Condition not met: '+${JSON.stringify(expression)}));requestAnimationFrame(check)};check()})`);
const state = `
  localStorage.clear();
  window.__calls=[]; window.__args={}; window.__alerts=[];
  window.alert=message=>window.__alerts.push(message);
  window.__loginCall=async(method,arg)=>{window.__args[method]=arg;window.__calls.push({method,arg:JSON.parse(JSON.stringify(arg))});return {data:null};};
  const originalFetch=window.fetch;
  window.fetch=(url,...args)=>String(url)==='/api/session'?Promise.resolve(new Response(JSON.stringify(window.__sessionUser?{user:{id:'fictional'}}:null),{headers:{'Content-Type':'application/json'}})):originalFetch(url,...args);
  window.PublicKeyCredential={isConditionalMediationAvailable:async()=>false};
`;
async function visit(query = '', extra = '', origin = base) {
  await browser.navigate(origin + '/' + query, state + extra);
  await wait(`document.querySelector('astro-island')&&!document.querySelector('astro-island').hasAttribute('ssr')`);
  await wait(`document.querySelector('.portal-login').getAttribute('aria-busy')==='false'`);
}
async function email(value = 'fictional@example.invalid') {
  await evaluate(`document.querySelector('input[type="email"]').focus()`);
  await browser.page('Input.insertText', { text: value });
}
async function navigation(action, path) {
  try { await action(); } catch (error) {
    if (!/Inspected target navigated|Execution context was destroyed/.test(error.message)) throw error;
  }
  // Runtime promises belong to the old document and are destroyed on redirect.
  for (let attempt = 0; attempt < 300; attempt++) {
    const {frameTree} = await browser.page('Page.getFrameTree');
    if (new URL(frameTree.frame.url).pathname === path) return;
  }
  assert.fail(`Expected navigation to ${path}`);
}

test('SSR controls cannot submit an email before hydration or with JavaScript disabled', async () => {
  const query = '?app=capyschool&redirect=' + encodeURIComponent('http://localhost:4321/lesson');
  await browser.page('Emulation.setScriptExecutionDisabled', { value: true });
  try {
    await browser.navigate(base + '/' + query, '');
    assert.equal(await evaluate(`document.querySelector('input[type="email"]').disabled`), true);
    assert.ok(await evaluate(`[...document.querySelectorAll('.portal-login button')].every(button=>button.disabled)`));
    assert.equal(await evaluate(`document.querySelector('.email-form').method`), 'post');
    await browser.page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
    await browser.page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    assert.equal(await evaluate(`location.search`), query);
  } finally { await browser.page('Emulation.setScriptExecutionDisabled', { value: false }); }
});

test('all six provider buttons retain the real provider IDs and app callback destinations', async () => {
  await visit('?app=capyschool&redirect=' + encodeURIComponent('http://localhost:4321/lesson?unit=1'));
  await wait(`document.body.textContent.includes('CapySchool')`);
  for (const provider of ['google', 'github', 'microsoft', 'kakao', 'naver', 'line']) {
    await evaluate(`document.querySelector('[data-provider="${provider}"]').click()`);
  }
  const calls = await evaluate(`__calls.filter(call=>call.method==='signIn.social')`);
  assert.deepEqual(calls.map(call=>call.arg.provider), ['google', 'github', 'microsoft', 'kakao', 'naver', 'line']);
  const expected = '/api/sso/bridge?' + new URLSearchParams({ redirect: 'http://localhost:4321/lesson?unit=1' });
  for (const {arg} of calls) assert.deepEqual(arg, {provider:arg.provider,callbackURL:expected,newUserCallbackURL:expected,errorCallbackURL:expected});
  assert.equal(await evaluate(`localStorage.getItem('app.id')`), 'capyschool');
});

test('invalid app queries visibly block every sign-in button through native disabling', async () => {
  await visit('?app=capyschool');
  await wait(`document.body.textContent.includes('Missing parameter: redirect')`);
  assert.ok(await evaluate(`!!document.querySelector('[role="alert"]')`));
  assert.ok(await evaluate(`[...document.querySelectorAll('.portal-login button')].every(button=>button.disabled)`));
  await evaluate(`document.querySelectorAll('.portal-login button').forEach(button=>button.click())`);
  assert.deepEqual(await evaluate(`__calls`), []);
});

test('email submit uses the real magic-link handler and native email validation', async () => {
  await visit();
  await evaluate(`document.querySelector('.email-form').requestSubmit()`);
  assert.deepEqual(await evaluate(`__calls`), []);
  await email('not-an-email');
  await evaluate(`document.querySelector('.email-form').requestSubmit()`);
  assert.deepEqual(await evaluate(`__calls`), []);
  await visit();
  await email();
  await evaluate(`document.querySelector('.email-form').requestSubmit()`);
  await wait(`__calls.some(call=>call.method==='signIn.magicLink')`);
  assert.deepEqual(await evaluate(`__calls.find(call=>call.method==='signIn.magicLink').arg`), {
    email:'fictional@example.invalid',callbackURL:'/dashboard',newUserCallbackURL:'/dashboard',errorCallbackURL:'/dashboard',
  });
  assert.match(await evaluate(`__alerts[0]`), /Magic link sent/);
});

test('passkey keeps its existing success callback and dashboard redirect', async () => {
  await visit();
  await evaluate(`document.querySelector('.passkey-button').click()`);
  assert.equal(await evaluate(`__calls.at(-1).method`), 'signIn.passkey');
  await navigation(() => evaluate(`__args['signIn.passkey'].fetchOptions.onSuccess()`), '/dashboard');
});

test('signed-in explicit app handoff uses the existing same-origin SSO bridge', async () => {
  await navigation(() => browser.navigate(base + '/?app=capyschool&redirect=' + encodeURIComponent('http://localhost:4321/lesson'), state + 'window.__sessionUser=true;'), '/api/sso/bridge');
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('redirect')`), 'http://localhost:4321/lesson');
});

test('signed-in saved app handoff is retained, but an invalid explicit query cannot reuse it', async () => {
  const saved = `localStorage.setItem('app.id','capyschool');localStorage.setItem('app.redirect','http://localhost:4321/saved');window.__sessionUser=true;`;
  await navigation(() => browser.navigate(base, state + saved), '/api/sso/bridge');
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('redirect')`), 'http://localhost:4321/saved');
  await visit('?app=unknown&redirect=' + encodeURIComponent('https://unregistered.example.invalid/'), saved);
  await wait(`!!document.querySelector('[role="alert"]')`);
  assert.equal(await evaluate(`location.pathname`), '/');
  assert.deepEqual(await evaluate(`__calls`), []);
});

test('conditional passkey autofill remains connected to the original success redirect', async () => {
  await visit('', `window.PublicKeyCredential.isConditionalMediationAvailable=async()=>true;`);
  await wait(`__calls.some(call=>call.method==='signIn.passkey'&&call.arg.autoFill===true)`);
  await navigation(() => evaluate(`__args['signIn.passkey'].fetchOptions.onSuccess()`), '/dashboard');
});

test('denied storage does not prevent a valid provider request or fall back to an unsafe destination', async () => {
  await visit('', `Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}});`);
  await evaluate(`document.querySelector('[data-provider="google"]').click()`);
  assert.equal(await evaluate(`__calls.at(-1).arg.callbackURL`), '/dashboard');
  await visit('?app=capyschool&redirect=' + encodeURIComponent('https://unregistered.example.invalid/'));
  await wait(`!!document.querySelector('[role="alert"]')`);
  assert.ok(await evaluate(`[...document.querySelectorAll('.providers button')].every(button=>button.disabled)`));
});

test('local social controls are visual-only while email/inbox retain their real local callback', async () => {
  const local = await loginFixture({ local: true });
  try {
    const origin = await local.listen();
    await visit('', '', origin);
    assert.equal(await evaluate(`document.querySelectorAll('.passkey-button,.configuration-note').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('.providers button').length`), 6);
    assert.ok(await evaluate(`[...document.querySelectorAll('.providers button')].every(button=>button.disabled&&getComputedStyle(button).opacity==='1'&&getComputedStyle(button).backgroundImage.startsWith('linear-gradient'))`));
    assert.match(await evaluate(`document.querySelector('#login-local-social-note').textContent`), /solo visuales/);
    await evaluate(`document.querySelectorAll('.providers button').forEach(button=>button.click())`);
    assert.deepEqual(await evaluate(`__calls`), []);
    assert.equal(await evaluate(`document.querySelector('[href="/dev/inbox"]').target`), '_blank');
    await email();
    await evaluate(`document.querySelector('.email-form').requestSubmit()`);
    await wait(`__calls.some(call=>call.method==='signIn.magicLink')`);
    assert.equal(await evaluate(`__calls.at(-1).arg.callbackURL`), origin + '/dashboard');
    assert.match(await evaluate(`__alerts.at(-1)`), /local inbox/);
  } finally { await local.close(); }
});

test('A remains usable on desktop and narrow screens with visible keyboard focus and reduced motion', async () => {
  for (const width of [1440, 390, 320]) {
    await browser.page('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false});
    await visit();
    assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`), false);
    assert.equal(await evaluate(`document.querySelectorAll('.providers button').length`), 6);
    assert.ok(await evaluate(`[...document.querySelectorAll('.providers button')].every(button=>button.scrollWidth<=button.clientWidth)`));
    assert.equal(await evaluate(`document.querySelector('#login-email').labels.length`), 1);
  }
  await browser.page('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
  await browser.page('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');
  await browser.page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.portal-bloom')).animationName`), 'none');
  assert.deepEqual(browser.exceptions, []);
});
