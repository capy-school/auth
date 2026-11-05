import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { test } from 'node:test';
import { build, createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';
import { accountState } from './helpers/account-state.mjs';

const moduleAt = async (path) => {
  const url = new URL(`../src/kit/lib/account/${path}.ts`, import.meta.url);
  assert.ok(existsSync(url), `Account ${path} implementation is absent`);
  return import(url.href);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const user = { id: 'account-fixture', name: '<b>Actual account</b>', email: 'account@example.invalid', role: 'admin', emailVerified: true };

test('session bootstrap is explicit and never authorizes while a read is pending', async () => {
  const { createAccountSession } = await moduleAt('lifecycle');
  const pending = deferred();
  const states = [], signals = [];
  const session = createAccountSession({
    read: async (signal) => { signals.push(signal); return pending.promise; },
    update: (state) => states.push(state), redirect: () => assert.fail('Unexpected redirect'),
  });
  assert.deepEqual(states, []);
  assert.equal(signals.length, 0);
  const reading = session.retry();
  assert.deepEqual(states, [{ state: 'loading' }]);
  assert.equal(signals[0].aborted, false);
  pending.resolve({ state: 'authenticated', user });
  await reading;
  assert.deepEqual(states.at(-1), { state: 'authenticated', user });
  session.destroy();
});

test('anonymous sessions redirect to login without enabling protected content', async () => {
  const { createAccountSession } = await moduleAt('lifecycle');
  const states = [], redirects = [];
  const session = createAccountSession({ read: async () => ({ state: 'anonymous' }), update: (state) => states.push(state), redirect: (path) => redirects.push(path) });
  await session.retry();
  assert.deepEqual(redirects, ['/']);
  assert.equal(states.some(({ state }) => state === 'authenticated'), false);
  session.destroy();
});

test('service failures show a retryable error, not logout or an example account', async () => {
  const { createAccountSession } = await moduleAt('lifecycle');
  const states = [];
  let attempts = 0;
  const session = createAccountSession({
    read: async () => { if (++attempts === 1) throw new Error('503'); return { state: 'authenticated', user }; },
    update: (state) => states.push(state), redirect: () => assert.fail('Service failure is not anonymous'),
  });
  await session.retry();
  assert.equal(states.at(-1).state, 'error');
  await session.retry();
  assert.deepEqual(states.at(-1), { state: 'authenticated', user });
  assert.equal(attempts, 2);
  session.destroy();
});

test('malformed authenticated results never enable the account', async () => {
  const { createAccountSession } = await moduleAt('lifecycle');
  for (const result of [null, {}, { state: 'authenticated' }, { state: 'authenticated', user: {} }, { state: 'authenticated', user: { id: '   ' } }]) {
    const states = [];
    const session = createAccountSession({ read: async () => result, update: (state) => states.push(state), redirect: () => assert.fail('Malformed is not anonymous') });
    await session.retry();
    assert.equal(states.at(-1).state, 'error');
    session.destroy();
  }
});

test('leaving a protected view aborts its request and ignores a late result', async () => {
  const { createAccountSession } = await moduleAt('lifecycle');
  const pending = deferred();
  const states = [];
  let signal;
  const session = createAccountSession({ read: async (value) => { signal = value; return pending.promise; }, update: (state) => states.push(state), redirect: () => assert.fail('Destroyed view redirected') });
  const reading = session.retry();
  session.destroy();
  assert.equal(signal.aborted, true);
  pending.resolve({ state: 'authenticated', user });
  await reading;
  assert.deepEqual(states, [{ state: 'loading' }]);
  await session.retry();
  assert.deepEqual(states, [{ state: 'loading' }]);
});

test('retry aborts and supersedes an earlier session check', async () => {
  const { createAccountSession } = await moduleAt('lifecycle');
  const pending = deferred();
  const states = [], signals = [];
  const session = createAccountSession({
    read: async (signal) => { signals.push(signal); return signals.length === 1 ? pending.promise : { state: 'authenticated', user }; },
    update: (state) => states.push(state), redirect: () => assert.fail('Stale request redirected'),
  });
  const previous = session.retry();
  await session.retry();
  assert.equal(signals[0].aborted, true);
  pending.resolve({ state: 'anonymous' });
  await previous;
  assert.deepEqual(states.at(-1), { state: 'authenticated', user });
  session.destroy();
});

test('manager action loads only after authorization and cancels a pending import on destruction', async () => {
  const { createManagerAction } = await moduleAt('manager');
  const pending = deferred();
  let loads = 0, mounts = 0;
  const action = createManagerAction(async () => { ++loads; return pending.promise; });
  const root = { querySelector: () => null };
  const mounted = action(root, { name: 'sessions', authorized: false });
  assert.equal(loads, 0);
  mounted.update({ name: 'sessions', authorized: true });
  assert.equal(loads, 1);
  mounted.destroy();
  pending.resolve(() => { ++mounts; });
  await pending.promise;
  await Promise.resolve();
  assert.equal(mounts, 0);
});

test('manager action explicitly mounts each fresh view even if its module is cached', async () => {
  const { createManagerAction } = await moduleAt('manager');
  const roots = [];
  const action = createManagerAction(async () => (root) => roots.push(root));
  const first = { querySelector: () => null }, second = { querySelector: () => null };
  const one = action(first, { name: 'api-keys', authorized: true });
  await Promise.resolve();
  one.update({ name: 'api-keys', authorized: true });
  one.destroy();
  const two = action(second, { name: 'api-keys', authorized: true });
  await Promise.resolve();
  assert.deepEqual(roots, [first, second]);
  two.destroy();
});

test('failed manager imports expose retry and remove their listener on destruction', async () => {
  const { createManagerAction } = await moduleAt('manager');
  let attempts = 0, mounts = 0, click;
  const retry = { hidden: true, addEventListener: (_, listener) => { click = listener; }, removeEventListener: () => { click = undefined; } };
  const error = { hidden: true, textContent: '' }, loading = { hidden: false };
  const root = { querySelector: selector => ({ '[data-retry]': retry, '[data-error]': error, '[data-loading]': loading })[selector] };
  const action = createManagerAction(async () => { if (++attempts === 1) throw new Error('Chunk unavailable'); return () => { ++mounts; }; });
  const view = action(root, { name: 'passkeys', authorized: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mounts, 0);
  assert.equal(error.hidden, false);
  assert.equal(loading.hidden, true);
  assert.equal(retry.hidden, false);
  click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mounts, 1);
  view.destroy();
  assert.equal(click, undefined);
});

test('logout awaits successful signOut and blocks duplicate requests', async () => {
  const { createLogout } = await moduleAt('lifecycle');
  const pending = deferred();
  const states = [], redirects = [];
  let calls = 0;
  const logout = createLogout({ signOut: async () => { ++calls; return pending.promise; }, update: (state) => states.push(state), redirect: (path) => redirects.push(path) });
  assert.equal(calls, 0);
  const sending = logout.submit();
  await logout.submit();
  assert.equal(calls, 1);
  assert.equal(states.at(-1), 'loading');
  assert.deepEqual(redirects, []);
  pending.resolve({ data: { success: true }, error: null });
  await sending;
  assert.deepEqual(redirects, ['/']);
  logout.destroy();
});

test('logout failures and malformed responses stay on the page and can retry', async () => {
  const { createLogout } = await moduleAt('lifecycle');
  for (const result of [null, undefined, { data: null, error: { status: 503 } }, { data: null, error: null }]) {
    let attempts = 0;
    const states = [], redirects = [];
    const logout = createLogout({ signOut: async () => ++attempts === 1 ? result : { data: { success: true } }, update: (state) => states.push(state), redirect: (path) => redirects.push(path) });
    await logout.submit();
    assert.equal(states.at(-1), 'error');
    assert.deepEqual(redirects, []);
    await logout.submit();
    assert.deepEqual(redirects, ['/']);
    logout.destroy();
  }
});

test('logout does not redirect a destroyed view after a late success', async () => {
  const { createLogout } = await moduleAt('lifecycle');
  const pending = deferred();
  const logout = createLogout({ signOut: () => pending.promise, update: () => {}, redirect: () => assert.fail('Destroyed logout redirected') });
  const sending = logout.submit();
  logout.destroy();
  pending.resolve({ data: { success: true } });
  await sending;
});

test('a rejected sign-out request remains retryable', async () => {
  const { createLogout } = await moduleAt('lifecycle');
  const states = [], redirects = [];
  let attempts = 0;
  const logout = createLogout({ signOut: async () => { if (++attempts === 1) throw new Error('Offline'); return { data: { success: true } }; }, update: value => states.push(value), redirect: path => redirects.push(path) });
  await logout.submit();
  assert.equal(states.at(-1), 'error');
  assert.deepEqual(redirects, []);
  await logout.submit();
  assert.deepEqual(redirects, ['/']);
  logout.destroy();
});

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const components = ['AccountShell', 'AccountPage', 'Dashboard', 'Icon', 'Feedback', 'Sessions', 'Passkeys', 'ApiKeys', 'TwoFactor', 'Organizations'];

const stubs = {
  name: 'isolated-kit-account-contracts', enforce: 'pre',
  resolveId(id) {
    if (id === '$app/navigation') return '\0kit-account-navigation';
    if (id === '$lib/auth/session' || /\/kit\/lib\/auth\/session(?:\.ts)?$/.test(id)) return '\0kit-account-session';
    if (id.endsWith('/lib/auth-client')) return '\0kit-account-client';
  },
  load(id) {
    if (id === '\0kit-account-navigation') return `export const goto=async(path)=>{window.__redirects.push(path)};`;
    if (id === '\0kit-account-session') return `export const readSession=async(fetcher,signal)=>window.__readAccountSession(signal);`;
    if (id === '\0kit-account-client') return `const call=(path)=>new Proxy(()=>{}, {get:(_,key)=>call([...path,key]),apply:(_,self,args)=>window.__accountCall(path.join('.'),...args)});export const authClient=call([]);`;
  },
};

test('all account routes render generic approved markup with inert protected content and disabled forms', async () => {
  for (const name of components) assert.ok(existsSync(new URL(`../src/kit/lib/account/${name}.svelte`, import.meta.url)), `${name} Svelte port is absent`);
  const temporary = await mkdtemp('/tmp/opencode/auth-kit-account-render-');
  const warnings = [];
  let vite;
  try {
    vite = await createServer({
      configFile: false, envDir: 'src/kit', cacheDir: `${temporary}/cache`,
      optimizeDeps: { noDiscovery: true, include: [] },
      resolve: { alias: { $lib: new URL('../src/kit/lib', import.meta.url).pathname } },
      plugins: [stubs, svelte({ configFile: false, onwarn: warning => warnings.push({ code: warning.code, message: warning.message }) })],
      server: { middlewareMode: true, watch: null, hmr: false },
    });
    const { render } = await vite.ssrLoadModule('svelte/server');
    for (const name of ['AccountPage', 'Dashboard']) {
      const Component = (await vite.ssrLoadModule(`/src/kit/lib/account/${name}.svelte`)).default;
      for (const page of name === 'AccountPage' ? ['security', 'sessions', 'passkey', 'two-factor', 'api-keys', 'organizations'] : [undefined]) {
        const { body, head } = render(Component, { props: page ? { page } : {} });
        assert.match(head, /Login Gateway/);
        assert.match(body, /<h1>/);
        assert.match(body, /aria-label="Mi cuenta"/);
        for (const path of ['/dashboard', '/settings/security', '/settings/sessions', '/settings/organizations', '/logout']) assert.ok(body.includes(`href="${path}"`));
        assert.match(body, /data-account-protected[^>]*hidden[^>]*inert/);
        assert.match(body, /data-session-loading/);
        assert.match(body, /data-session-retry/);
        assert.doesNotMatch(body, /John Doe|john@|localhost|account@example\.invalid|opaque-current-token|fictional-one-time-key|href="\/api\/auth\/reference"/);
        for (const [fieldset] of body.matchAll(/<fieldset\b[^>]*>/g)) assert.match(fieldset, /\bdisabled\b/);
        for (const [form] of body.matchAll(/<form\b[^>]*>/g)) assert.match(form, /method="post"/);
        for (const [secret] of body.matchAll(/<section\b[^>]*class="account-secret"[^>]*>/g)) assert.match(secret, /\bhidden\b/);
        if (page === 'two-factor') assert.match(body, /pattern="\[0-9\]\{6\}"/);
      }
    }
    const { entries, load } = await vite.ssrLoadModule('/src/kit/routes/settings/[section]/+page.ts');
    const sections = ['security', 'sessions', 'passkey', '2fa', 'api-keys', 'organizations'];
    assert.deepEqual(entries().map(({ section }) => section), sections);
    for (const section of sections) assert.deepEqual(load({ params: { section } }), { section });
    assert.throws(() => load({ params: { section: 'invalid' } }), (error) => error.status === 404);
    const Settings = (await vite.ssrLoadModule('/src/kit/routes/settings/[section]/+page.svelte')).default;
    assert.match(render(Settings, { props: { data: { section: '2fa' } } }).body, /data-manager="two-factor"/);
    assert.match(source('src/kit/routes/settings/[section]/+page.svelte'), /\{#key data\.section\}/);
    const Logout = (await vite.ssrLoadModule('/src/kit/routes/logout/+page.svelte')).default;
    const logout = render(Logout).body;
    assert.match(logout, /<h1>Cerrar sesión<\/h1>/);
    assert.match(logout, /<button[^>]*disabled[^>]*data-sign-out/);
    assert.deepEqual(warnings, [], 'Account components must compile without accessibility warnings');
  } finally {
    await vite?.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('shared controllers expose explicit mounts while retaining Astro automatic mounting', () => {
  for (const [file, entry] of [['sessions', 'mountSessions'], ['passkeys', 'mountPasskeys'], ['api-keys', 'mountApiKeys'], ['two-factor', 'mountTwoFactor'], ['organizations', 'mountOrganizations']]) {
    const code = source(`src/components/account/${file}.ts`);
    assert.match(code, new RegExp(`export function ${entry}\\(`));
    assert.match(code, new RegExp(`${entry}\\(\\);`));
  }
});

test('automatic mounting skips Kit roots and explicit root mounting is idempotent', async () => {
  const { mount } = await import('../src/components/account/ui.ts');
  const previous = globalThis.document;
  const makeRoot = kit => ({ dataset: {}, matches: () => true, hasAttribute: name => kit && name === 'data-kit-manager', querySelectorAll: () => [] });
  const astro = makeRoot(false), kit = makeRoot(true), initialized = [];
  globalThis.document = { querySelectorAll: () => [astro, kit] };
  try {
    const initialize = async root => { initialized.push(root); };
    mount('[data-manager="sessions"]', initialize);
    mount('[data-manager="sessions"]', initialize);
    assert.deepEqual(initialized, [astro]);
    assert.equal(kit.dataset.mounted, undefined);
    mount('[data-manager="sessions"]', initialize, kit);
    mount('[data-manager="sessions"]', initialize, kit);
    assert.deepEqual(initialized, [astro, kit]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(kit.dataset.accountReady, 'true');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('account components pass isolated strict type checking without Kit sync or generated writes', async () => {
  const temporary = await mkdtemp('/tmp/opencode/auth-kit-account-types-');
  const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
  try {
    const config = `${temporary}/tsconfig.json`;
    await writeFile(config, JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
        allowJs: true, checkJs: false, skipLibCheck: true, resolveJsonModule: true,
        esModuleInterop: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: [],
        paths: { '$lib/*': [`${root}/src/kit/lib/*`] },
      },
      include: [
        `${root}/src/kit/lib/account/**/*`,
        `${root}/src/kit/routes/dashboard/+page.svelte`,
        `${root}/src/kit/routes/settings/[section]/+page.svelte`,
        `${root}/src/kit/routes/logout/+page.svelte`,
        `${root}/node_modules/svelte/types/index.d.ts`,
        `${root}/node_modules/@sveltejs/kit/types/index.d.ts`,
        `${root}/node_modules/vite/client.d.ts`,
      ],
    }));
    const checked = spawnSync(process.execPath, [`${root}/node_modules/svelte-check/bin/svelte-check`, '--workspace', root, '--tsconfig', config, '--fail-on-warnings'], { cwd: root, encoding: 'utf8' });
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
    assert.match(checked.stdout, /0 errors and 0 warnings/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

// Controlled component/DOM acceptance, not the production Kit router or real SDK.
// The parent kit-app-browser suite verifies that separate integration boundary.
test('compiled account components gate managers and survive keyed view remounts', async (t) => {
  const temporary = await mkdtemp('/tmp/opencode/auth-kit-account-dom-');
  const fixtureId = new URL('./kit-account-virtual.svelte', import.meta.url).pathname;
  let http, browser;
  try {
    const output = await build({
      configFile: false, envDir: 'src/kit', cacheDir: `${temporary}/cache`, logLevel: 'error',
      resolve: { alias: { $lib: new URL('../src/kit/lib', import.meta.url).pathname } },
      plugins: [stubs, {
        name: 'isolated-account-component',
        resolveId(id) { if (id === 'kit-account-test') return '\0kit-account-test'; if (id === fixtureId) return fixtureId; },
        load(id) {
          if (id === '\0kit-account-test') return `import {mount} from 'svelte';import Fixture from ${JSON.stringify(fixtureId)};mount(Fixture,{target:document.getElementById('app')});`;
          if (id === fixtureId) return `<script>
            import {onMount} from 'svelte';
            import Dashboard from '../src/kit/lib/account/Dashboard.svelte';
            import Settings from '../src/kit/routes/settings/[section]/+page.svelte';
            import Logout from '../src/kit/routes/logout/+page.svelte';
            let section=$state('dashboard');
            onMount(()=>{window.__visit=(next)=>{section=next};return()=>{delete window.__visit}});
          </script>
          {#if section==='dashboard'}<Dashboard />{:else if section==='logout'}<Logout />{:else}<Settings data={{section}} />{/if}`;
        },
      }, svelte({ configFile: false })],
      build: { write: false, minify: false, rollupOptions: { input: 'kit-account-test', output: { inlineDynamicImports: true } } },
    });
    const js = output.output.find(item => item.type === 'chunk').code;
    assert.ok(js.includes('window.__readAccountSession'), 'Isolated component bundle must use the controlled session reader');
    const css = output.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
    http = createHttpServer((request, response) => {
      const path = new URL(request.url, 'http://component.invalid').pathname;
      response.setHeader('Cache-Control', 'no-store');
      if (path === '/component.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); }
      else if (path === '/component.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
      else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="es"><head><link rel="stylesheet" href="/component.css"></head><body><div id="app"></div><script type="module" src="/component.js"></script></body></html>'); }
    });
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${http.address().port}`;
    browser = await dashboardChrome();
    const evaluate = expression => browser.evaluate(expression);
    const wait = expression => evaluate(`new Promise((resolve,reject)=>{let tries=0;const check=()=>{if(${expression})return resolve(true);if(++tries>180)return reject(new Error('Condition not met: '+${JSON.stringify(expression)}));requestAnimationFrame(check)};check()})`);
    const preload = accountState + `
      window.confirm=()=>true;
      window.__redirects=[];window.__sessionSignals=[];window.__user=${JSON.stringify(user)};window.__readMode='ready';
      window.__readAccountSession=async(signal)=>{
        window.__sessionSignals.push(signal);
        if(window.__readMode==='hold')return new Promise(resolve=>{window.__releaseSession=resolve});
        if(window.__readMode==='error')throw new Error('503');
        if(window.__readMode==='anonymous')return {state:'anonymous'};
        if(window.__readMode==='malformed')return {state:'authenticated',user:{}};
        return {state:'authenticated',user:window.__user};
      };
      const accountCall=window.__accountCall;
      window.__accountCall=async(method,arg)=>{
        if(method!=='signOut')return accountCall(method,arg);
        window.__calls.push({method,arg});
        if(window.__logoutMode==='error')return {data:null,error:{status:503}};
        if(window.__logoutMode==='hold')return new Promise(resolve=>{window.__releaseLogout=resolve});
        return {data:{success:true},error:null};
      };`;
    const visit = async (section) => {
      const before = await evaluate('window.__sessionSignals.length');
      await evaluate(`window.__visit(${JSON.stringify(section)})`);
      if (section !== 'logout') {
        await wait(`window.__sessionSignals.length===${before + 1} && !document.querySelector('[data-account-protected]').hidden`);
        await wait(`[...document.querySelectorAll('[data-manager]')].every(root=>root.dataset.accountReady==='true')`);
      } else await wait(`!document.querySelector('[data-sign-out]').disabled`);
    };
    const submit = (selector, values) => evaluate(`{const form=document.querySelector(${JSON.stringify(selector)});for(const [name,value]of Object.entries(${JSON.stringify(values)}))form.elements.namedItem(name).value=value;form.requestSubmit()}`);
    const count = method => evaluate(`window.__calls.filter(call=>call.method===${JSON.stringify(method)}).length`);

    await t.test('no manager read precedes session, then real profile data is escaped and admin reference is conditional', async () => {
      await browser.navigate(base, preload + `window.__readMode='hold';`);
      await wait('window.__sessionSignals.length===1');
      assert.equal(await count('listSessions'), 0);
      assert.equal(await evaluate(`document.querySelector('[data-account-protected]').hidden && document.querySelector('[data-account-protected]').inert`), true);
      assert.equal(await evaluate(`document.querySelector('.dashboard-profile-name h2').textContent`), '');
      await evaluate(`window.__releaseSession({state:'authenticated',user:window.__user})`);
      await wait(`document.querySelector('[data-manager]').dataset.accountReady==='true'`);
      assert.equal(await evaluate(`document.querySelector('.dashboard-profile-name h2').textContent`), user.name);
      assert.equal(await evaluate(`document.querySelector('.dashboard-profile-name h2 b')===null`), true);
      assert.equal(await evaluate(`document.querySelector('.dashboard-profile-name p').textContent`), user.email);
      assert.equal(await evaluate(`!!document.querySelector('a[href="/api/auth/reference"]')`), true);
      await evaluate(`window.__readMode='ready'`);
      await visit('security');
      await evaluate(`window.__user={...window.__user,role:'user',emailVerified:false}`);
      await visit('dashboard');
      assert.equal(await evaluate(`document.querySelector('a[href="/api/auth/reference"]')===null`), true);
      assert.equal(await evaluate(`document.querySelector('.dashboard-badges .is-verified')===null`), true);
    });

    await t.test('503 and malformed sessions keep fields disabled; retry enables only after a valid session', async () => {
      await browser.navigate(base, preload + `window.__readMode='error';`);
      await wait(`!document.querySelector('[data-session-error]').hidden`);
      assert.equal(await evaluate('window.__calls.length'), 0);
      assert.equal(await evaluate('window.__redirects.length'), 0);
      await evaluate(`window.__readMode='malformed';document.querySelector('[data-session-retry]').click()`);
      await wait(`window.__sessionSignals.length===2 && !document.querySelector('[data-session-error]').hidden`);
      assert.equal(await evaluate('window.__calls.length'), 0);
      await evaluate(`window.__readMode='hold';window.__visit('passkey')`);
      await wait(`window.__sessionSignals.length===3`);
      assert.equal(await evaluate(`document.querySelector('#passkey-name').matches(':disabled')`), true);
      await evaluate(`window.__releaseSession({state:'authenticated',user:window.__user})`);
      await wait(`document.querySelector('[data-manager]').dataset.accountReady==='true'`);
      assert.equal(await evaluate(`document.querySelector('#passkey-name').matches(':disabled')`), false);
    });

    await t.test('anonymous reads redirect and route departure aborts pending session work', async () => {
      await browser.navigate(base, preload + `window.__readMode='anonymous';`);
      await wait(`window.__redirects.length===1`);
      assert.deepEqual(await evaluate('window.__redirects'), ['/']);
      assert.equal(await evaluate('window.__calls.length'), 0);
      await evaluate(`window.__readMode='hold';window.__visit('passkey')`);
      await wait(`window.__sessionSignals.length===2`);
      await evaluate(`window.__oldRelease=window.__releaseSession;window.__readMode='ready';window.__visit('api-keys')`);
      await wait(`document.querySelector('[data-manager="api-keys"]')?.dataset.accountReady==='true'`);
      assert.equal(await evaluate('window.__sessionSignals[1].aborted'), true);
      await evaluate(`window.__oldRelease({state:'authenticated',user:window.__user})`);
      assert.equal(await count('passkey.listUserPasskeys'), 0);
    });

    await t.test('each manager mounts on repeat visits and a form submit causes one mutation', async () => {
      await browser.navigate(base, preload);
      await wait(`document.querySelector('[data-manager]').dataset.accountReady==='true'`);
      for (let round = 0; round < 2; ++round) {
        for (const section of ['sessions', 'passkey', '2fa', 'api-keys', 'organizations']) {
          await visit('security');
          await visit(section);
          assert.equal(await evaluate(`document.querySelector('[data-manager]').dataset.mounted`), 'true');
        }
        await visit('passkey');
        const before = await count('passkey.addPasskey');
        await submit('[data-passkey-form]', { name: `Device ${round}` });
        await wait(`document.querySelector('[data-list]').textContent.includes('Device ${round}')`);
        assert.equal(await count('passkey.addPasskey'), before + 1);
      }
    });

    await t.test('keyed settings discard one-time API keys and retain 2FA recovery material only in their current view', async () => {
      await visit('api-keys');
      const before = await count('apiKey.create');
      await submit('[data-api-key-form]', { name: 'Component integration' });
      await wait(`!document.querySelector('[data-new-key]').hidden`);
      assert.equal(await count('apiKey.create'), before + 1);
      assert.equal(await evaluate(`document.querySelector('[data-key-value]').textContent`), 'fictional-one-time-key');
      await visit('security');
      assert.equal(await evaluate(`document.body.textContent.includes('fictional-one-time-key')`), false);
      await visit('api-keys');
      assert.equal(await evaluate(`document.querySelector('[data-new-key]').hidden && !document.querySelector('[data-key-value]').textContent`), true);
      await visit('2fa');
      await submit('[data-two-factor-form]', { password: 'fixture-only-password' });
      await wait(`!document.querySelector('[data-backup-panel]').hidden`);
      assert.equal(await evaluate(`document.querySelector('#two-factor-password').value`), '');
      assert.equal(await evaluate(`document.querySelector('#totp-code').pattern`), '[0-9]{6}');
      await submit('[data-two-factor-verify]', { code: '123456' });
      try { await wait(`document.querySelector('[data-two-factor-state]').textContent.startsWith('Activada:')`); }
      catch (error) { throw new Error(`${error.message}: ${JSON.stringify(await evaluate(`({calls:window.__calls.slice(-8),error:document.querySelector('[data-error]').textContent,state:document.querySelector('[data-two-factor-state]').textContent,valid:document.querySelector('[data-two-factor-verify]').checkValidity(),disabled:document.querySelector('[data-two-factor-verify] fieldset').disabled})`))}`); }
      assert.equal(await evaluate(`document.querySelector('[data-backup-panel]').hidden`), false);
      await visit('security');
      await visit('2fa');
      assert.equal(await evaluate(`document.querySelector('[data-backup-codes]').children.length`), 0);
      assert.equal(await evaluate(`document.querySelector('[data-backup-panel]').hidden`), true);
    });

    await t.test('organization selection keeps member and invitation reads scoped to the chosen organization', async () => {
      await visit('organizations');
      await evaluate(`document.querySelector('[data-organization-select]').click()`);
      await wait(`document.querySelector('[data-members]').children.length===2`);
      const reads = await evaluate(`window.__calls.filter(call=>['organization.listMembers','organization.listInvitations'].includes(call.method))`);
      assert.ok(reads.length >= 2);
      assert.ok(reads.every(call => call.arg.query.organizationId === 'org-a'));
    });

    await t.test('logout retries a real controller failure and never redirects before success', async () => {
      await visit('logout');
      await evaluate(`window.__logoutMode='error';document.querySelector('[data-sign-out]').click()`);
      await wait(`!document.querySelector('[data-sign-out-error]').hidden`);
      assert.equal(await count('signOut'), 1);
      assert.deepEqual(await evaluate('window.__redirects'), []);
      await evaluate(`window.__logoutMode='hold';document.querySelector('[data-sign-out]').click()`);
      await wait(`typeof window.__releaseLogout==='function'`);
      assert.deepEqual(await evaluate('window.__redirects'), []);
      assert.equal(await evaluate(`document.querySelector('[data-sign-out]').disabled`), true);
      await evaluate(`window.__releaseLogout({data:{success:true},error:null})`);
      await wait(`window.__redirects.length===1`);
      assert.deepEqual(await evaluate('window.__redirects'), ['/']);
    });
    assert.deepEqual(browser.exceptions, []);
  } finally {
    await browser?.close();
    if (http) await new Promise(resolve => { http.closeAllConnections(); http.close(resolve); });
    await rm(temporary, { recursive: true, force: true });
  }
});
