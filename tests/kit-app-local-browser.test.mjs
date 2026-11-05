import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';

test('Kit development opt-in shows native disabled social previews and the local inbox, never a fake login', { timeout: 60000 }, async () => {
  const requests = [];
  const backend = createServer((request, response) => {
    requests.push({ path: request.url, method: request.method });
    response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"Unauthorized"}');
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.sveltekit.config.ts', '--host', '127.0.0.1', '--port', '0'], {
    env: { ...process.env, KIT_DIAGNOSTICS: '0', PUBLIC_KIT_AUTH_LOCAL_MODE: '1', API_UPSTREAM: `http://127.0.0.1:${backend.address().port}`, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', browser;
  child.stderr.on('data', data => { output += data; });
  try {
    const address = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local Kit server readiness: ' + output)), 20000);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Local Kit exited ${code}: ${output}`)); });
      child.stdout.on('data', data => {
        output += data;
        const match = output.replace(/\x1b\[[0-9;]*m/g, '').match(/http:\/\/127\.0\.0\.1:(\d+)\//);
        if (match) { clearTimeout(timer); resolve(`http://auth.localhost:${match[1]}`); }
      });
    });
    browser = await dashboardChrome();
    let ready = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt === 0) await browser.navigate(address, 'localStorage.clear();');
        await browser.evaluate(`new Promise((resolve,reject)=>{const end=performance.now()+10000;const check=()=>{if(document.querySelector('.portal-login')?.getAttribute('aria-busy')==='false')return resolve(true);if(performance.now()>end)return reject(new Error('Local UI did not hydrate'));requestAnimationFrame(check)};check()})`);
        ready = true;
        break;
      } catch (error) {
        // Cold Vite dependency optimization can reload the document once. Do
        // not suppress application errors or extend an unbounded timeout.
        if (!/Inspected target navigated|Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
      }
    }
    assert.equal(ready, true, output);
    assert.equal(await browser.evaluate(`document.querySelectorAll('[data-provider]').length`), 6);
    assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('[data-provider]')).every(button=>button.disabled)`), true);
    assert.equal(await browser.evaluate(`document.querySelectorAll('.passkey-button,.configuration-note').length`), 0);
    assert.equal(await browser.evaluate(`document.querySelector('#login-email').disabled`), false);
    assert.equal(await browser.evaluate(`document.querySelector('.local-inbox').getAttribute('href')`), '/dev/inbox');
    await browser.evaluate(`document.querySelectorAll('[data-provider]').forEach(button=>button.click())`);
    assert.equal(requests.some(request => request.method !== 'GET'), false);
    assert.deepEqual(browser.exceptions, []);
  } finally {
    await browser?.close();
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
  }
});
