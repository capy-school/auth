import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { dashboardFixture } from './helpers/dashboard-fixture.mjs';

let fixture;
before(async () => { fixture = await dashboardFixture(); });
after(async () => { await fixture?.close(); });
const pages = {"security":"Seguridad","sessions":"Sesiones activas","passkey":"Passkeys","two-factor":"Autenticación en dos pasos","api-keys":"Claves de API"};
for (const [page, title] of Object.entries(pages)) {
  test(`${page} uses the A shell with correct active section and title`, async () => {
    const html = await fixture.renderPage(page);
    assert.match(html, /class="dashboard-sidebar"/);
    assert.match(html, new RegExp(`<h1[^>]*>${title}</h1>`));
    assert.doesNotMatch(html, /bg-gray-800|backdrop-blur|data-notes/);
    const nav = html.match(/<nav class="dashboard-navigation"[^>]*>([\s\S]*?)<\/nav>/)[1];
    const active = page === 'sessions' || page === 'organizations' ? page : 'security';
    assert.match(nav, new RegExp(`href="/settings/${active}"[^>]*aria-current="page"`));
    assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
    for (const path of ['/dashboard', '/settings/security', '/settings/sessions', '/settings/organizations']) assert.ok(nav.includes(`href="${path}"`));
  });
}
test('local passkey unavailability is explicit and does not offer a pretend registration', async () => {
  const html = await fixture.renderPage('passkey', undefined, { passkeysAvailable: false });
  assert.match(html, /no están habilitadas en este entorno/i);
  assert.doesNotMatch(html, /data-passkey-add/);
});
for (const path of ["/settings/security","/settings/sessions","/settings/passkey","/settings/2fa","/settings/api-keys"]) {
  test(`${path} redirects anonymous requests and renders only with a session`, async () => {
    const anonymous = await fixture.renderRoute(path);
    assert.equal(anonymous.status, 302);
    assert.equal(anonymous.headers.get('location'), '/');
    const signedIn = await fixture.renderRoute(path, true);
    assert.equal(signedIn.status, 200);
    assert.match(await signedIn.text(), /alex@example.invalid/);
  });
}
