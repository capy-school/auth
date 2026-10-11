import assert from 'node:assert/strict';
import test from 'node:test';

async function request(path) {
  assert.ok(process.env.KIT_SMOKE_URL, 'KIT_SMOKE_URL is required; HTTP checks must not silently skip');
  return fetch(new URL(path, process.env.KIT_SMOKE_URL), {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
}

test('diagnostic HTML identifies the incomplete non-default candidate', async () => {
  const response = await request('/__migration');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('set-cookie'), null);
  const html = await response.text();
  assert.match(html, /<title>SvelteKit migration diagnostic<\/title>/);
  assert.match(html, /<h1\b[^>]*>SvelteKit migration diagnostic<\/h1>/);
  assert.match(html, /Astro remains the default application/);
  assert.match(html, /No authentication or database access/);
  assert.match(html, /href="\/__migration\/health"/);
  assert.doesNotMatch(html, /<form\b/);
});

test('login preview serves passkey, collapsed email and all providers without cookies or success claims', async () => {
  const response = await request('/__migration/login');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('set-cookie'), null);
  const html = await response.text();
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /Login presentation preview only — authentication is not connected\./);
  const controls = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.equal(controls.length, 8);
  const labels = ['Sign in with Passkey', 'Sign in with Email', 'Google', 'GitHub', 'Microsoft', 'Kakao', 'Naver', 'Line'];
  const visibleLabel = (content) => content.replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '').trim();
  assert.deepEqual(controls.map(([, , content]) => visibleLabel(content)), labels);
  for (const [, attributes] of controls) {
    assert.match(attributes, /type="button"/);
    assert.doesNotMatch(attributes, /\bdisabled\b/);
  }
  assert.equal([...html.matchAll(/<h2\b[^>]*>Passwordless<\/h2>/g)].length, 1);
  assert.ok(html.indexOf('Passwordless') < html.indexOf('Sign in with Passkey'));
  assert.match(controls[0][1], /from-indigo-500 to-indigo-600/);
  assert.match(controls[0][2], /M12 10a2 2 0 0 0-2 2c0 1\.02/);
  assert.doesNotMatch(html, /<input\b|<form\b|role="status"|Passkey requested|code sent|link sent|2FA Protected|login success|signed in/i);
});

test('dev serves the shared stylesheet imported by the login client module', async () => {
  const response = await request('/src/styles/global.css');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/(css|javascript)/);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(await response.text(), /\.auth-icon/);
});

test('dev still blocks unrelated application source outside the candidate', async () => {
  const response = await request('/src/lib/utils.ts');
  assert.equal(response.status, 403);
  await response.body?.cancel();
});

test('server health returns only a non-sensitive marker without cookies', async () => {
  const response = await request('/__migration/health');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    candidate: 'sveltekit-diagnostic',
    authentication: false,
  });
});

test('candidate does not expose root login or proxy the existing authentication API', async () => {
  for (const path of ['/', '/api/auth/get-session']) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
