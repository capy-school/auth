import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';
import { auditLoginContrast } from './helpers/login-contrast-audit.mjs';

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function until(work) {
  const end = Date.now() + 30000;
  let last;
  while (Date.now() < end) {
    try { const result = await work(); if (result) return result; }
    catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw last || new Error('Isolated API did not become ready');
}

test('real scratch image hydrates and authenticates through Nginx using an isolated Better Auth backend', { timeout: 240000 }, async () => {
  const image = process.env.AUTH_STATIC_IMAGE;
  assert.ok(image, 'AUTH_STATIC_IMAGE is required; do not silently skip image browser acceptance');
  // This test-only backend is deliberately outside the production build context.
  const server = await readFile(new URL('./fixtures/static-auth.ts', import.meta.url), 'utf8');
  const prefix = `auth-kit-browser-${process.pid}-${Date.now()}`;
  const context = await mkdtemp('/tmp/opencode/auth-static-browser-context-');
  const apiImage = `${prefix}:api`;
  const network = `${prefix}-net`;
  const frontend = `${prefix}-frontend`;
  const backend = `${prefix}-backend`;
  let browser, networkCreated = false;
  const containers = [];
  try {
    await mkdir(join(context, 'src/lib'), { recursive: true });
    await mkdir(join(context, 'tests/fixtures'), { recursive: true });
    for (const name of ['local-auth.ts', 'local-policy.mjs', 'local-inbox.mjs']) {
      await writeFile(join(context, 'src/lib', name), await readFile(new URL(`../src/lib/${name}`, import.meta.url)));
    }
    for (const name of ['package.json', 'bun.lock']) {
      await writeFile(join(context, name), await readFile(new URL(`../${name}`, import.meta.url)));
    }
    await writeFile(join(context, 'tests/fixtures/static-auth.ts'), server);
    // Legacy libsql's native addon needs glibc under Bun. This is only the
    // independent test backend; the application remains musl/static scratch.
    await writeFile(join(context, 'Dockerfile'), `FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4\nWORKDIR /app\nCOPY package.json bun.lock ./\nRUN bun install --frozen-lockfile --ignore-scripts\nCOPY src/ ./src/\nCOPY tests/fixtures/static-auth.ts ./tests/fixtures/static-auth.ts\nUSER 101:101\nENTRYPOINT ["bun","tests/fixtures/static-auth.ts"]\n`);
    docker('build', '--pull=false', '-t', apiImage, context);
    docker('network', 'create', network);
    networkCreated = true;
    docker('run', '-d', '--name', frontend, '--network', network, '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-p', '127.0.0.1::8080', '-e', 'API_UPSTREAM=http://auth:3000', image);
    containers.push(frontend);
    const binding = JSON.parse(docker('inspect', frontend))[0].NetworkSettings.Ports['8080/tcp'][0];
    const origin = `http://auth.localhost:${binding.HostPort}`;
    const loopback = `http://127.0.0.1:${binding.HostPort}`;
    docker('run', '-d', '--name', backend, '--network', network, '--network-alias', 'auth', '--read-only', '--tmpfs', '/state:rw,noexec,nosuid,size=16m,mode=1777', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-e', `PUBLIC_ORIGIN=${origin}`, apiImage);
    containers.push(backend);
    await until(async () => (await fetch(loopback + '/api/__test/ready')).ok);
    browser = await dashboardChrome();
    const evaluate = expression => browser.evaluate(expression);
    const wait = expression => evaluate(`new Promise((resolve,reject)=>{const end=performance.now()+10000;const check=()=>{if(${expression})return resolve(true);if(performance.now()>end)return reject(new Error('Image browser condition: '+${JSON.stringify(expression)}));requestAnimationFrame(check)};check()})`);
    assert.equal((await auditLoginContrast(browser, origin)).length, 108);
    await browser.page('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browser.navigate(origin + '/', `localStorage.clear();window.alert=()=>{};window.confirm=()=>true;`);
    await wait(`document.querySelector('.portal-login')?.getAttribute('aria-busy')==='false'`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-provider]').length`), 6);
    await evaluate(`document.querySelector('#login-email').focus()`);
    await browser.page('Input.insertText', { text: 'image-browser@example.invalid' });
    await evaluate(`document.querySelector('.email-form').requestSubmit()`);
    const message = await until(async () => {
      const messages = await (await fetch(loopback + '/api/__test/inbox')).json();
      return messages.find(item => item.email === 'image-browser@example.invalid');
    });
    await browser.navigate(message.url, `window.alert=()=>{};window.confirm=()=>true;`);
    await wait(`document.querySelector('[data-manager="sessions"]')?.dataset.accountReady==='true'`);
    assert.match(await evaluate(`document.querySelector('.dashboard-profile').textContent`), /image-browser@example.invalid/);
    await evaluate(`window.__imageSpa='same-document';document.querySelector('a[href="/settings/api-keys"]').click()`);
    await wait(`document.querySelector('[data-manager="api-keys"]')?.dataset.accountReady==='true'`);
    assert.equal(await evaluate('window.__imageSpa'), 'same-document');
    await evaluate(`document.querySelector('[data-api-key-form] input').value='Real image key';document.querySelector('[data-api-key-form]').requestSubmit()`);
    await wait(`document.querySelector('[data-new-key]')?.hidden===false&&document.querySelector('[data-key-value]').textContent.length>10`);
    await evaluate(`document.querySelector('[data-dismiss-key]').click();document.querySelector('.dashboard-wordmark').click()`);
    await wait(`document.querySelector('.dashboard-profile')&&document.querySelector('[data-manager="sessions"]')?.dataset.accountReady==='true'`);
    assert.equal(await evaluate('window.__imageSpa'), 'same-document');
    await evaluate(`document.querySelector('.dashboard-signout').click()`);
    await wait(`document.querySelector('[data-sign-out]')?.disabled===false`);
    await evaluate(`document.querySelector('[data-sign-out]').click()`);
    await wait(`document.querySelector('.portal-login')?.getAttribute('aria-busy')==='false'`);
    assert.equal(await evaluate(`fetch('/api/session',{cache:'no-store'}).then(response=>response.status)`), 401);
    assert.deepEqual(browser.exceptions, []);
  } catch (error) {
    for (const name of containers) {
      try {
        const logs = spawnSync('docker', ['logs', '--tail', '30', name], { encoding: 'utf8', timeout: 10000 });
        const state = JSON.parse(docker('inspect', name))[0].State;
        error.message += `\n${name}: ${JSON.stringify(state)}\n${logs.stdout || ''}${logs.stderr || ''}`;
      } catch { /* Owned container may already have exited. */ }
    }
    throw error;
  } finally {
    await browser?.close();
    for (const name of containers.reverse()) { try { docker('rm', '-f', name); } catch { /* Cleanup only owned resources. */ } }
    if (networkCreated) { try { docker('network', 'rm', network); } catch { /* Cleanup only owned network. */ } }
    try { docker('image', 'rm', apiImage); } catch { /* Never remove parent or user images. */ }
    await rm(context, { recursive: true, force: true });
  }
});
