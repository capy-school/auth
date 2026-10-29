import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';

// An owned Chrome profile and CDP pipe keep browser acceptance tests isolated
// from real accounts, user profiles and the running development server.
export async function dashboardChrome() {
  const directory = await mkdtemp('/tmp/opencode/auth-dashboard-chrome-');
  const child = spawn(process.env.DASHBOARD_CHROME_BIN || '/usr/bin/google-chrome', [
    '--headless', '--disable-gpu', '--disable-background-networking', '--disable-extensions',
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    `--user-data-dir=${directory}`, '--remote-debugging-pipe', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  let sequence = 0;
  let buffer = '';
  const pending = new Map();
  const events = new Map();
  const exceptions = [];
  child.stdio[4].on('data', data => {
    buffer += data.toString();
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const packet = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!packet) continue;
      const message = JSON.parse(packet);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
      const waiting = events.get(message.method);
      if (waiting) { events.delete(message.method); waiting(message.params); }
    }
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  const close = async () => {
    for (const { timer, reject } of pending.values()) { clearTimeout(timer); reject(new Error('Chrome closed')); }
    pending.clear();
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      await send('Browser.close').catch(() => { child.kill('SIGTERM'); });
      await exited;
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params = {}) => send(method, params, sessionId);
    await page('Page.enable');
    await page('Runtime.enable');
    let preloadId;
    return {
      page, exceptions, close,
      async evaluate(expression) {
        const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      },
      async navigate(url, source = 'localStorage.clear();') {
        if (preloadId) await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: preloadId });
        ({ identifier: preloadId } = await page('Page.addScriptToEvaluateOnNewDocument', { source }));
        const loaded = new Promise(resolve => events.set('Page.loadEventFired', resolve));
        await page('Page.navigate', { url });
        await loaded;
        await this.evaluate(`new Promise(resolve => { const ready = () => document.readyState === 'complete' ? resolve(true) : requestAnimationFrame(ready); ready(); })`);
      },
    };
  } catch (error) { await close(); throw error; }
}
