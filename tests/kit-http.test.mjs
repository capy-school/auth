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

test('candidate does not expose or proxy the existing authentication API', async () => {
  const response = await request('/api/auth/get-session');
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('set-cookie'), null);
});
