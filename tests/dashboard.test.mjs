import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dashboardFixture, exampleUser } from './helpers/dashboard-fixture.mjs';

let fixture;
before(async () => { fixture = await dashboardFixture(); });
after(async () => { await fixture?.close(); });

test('renders approved A with actual profile props and the original settings destinations', async () => {
  const html = await fixture.render();
  assert.match(html, /Cuenta y seguridad/);
  assert.match(html, /Alex Example/);
  assert.match(html, /alex@example.invalid/);
  assert.match(html, /Correo verificado/);
  for (const path of ['/logout', '/settings/passkey', '/settings/2fa', '/settings/api-keys', '/settings/organizations']) {
    assert.ok(html.includes(`href="${path}"`), path);
  }
  assert.match(html, /dashboard-sidebar/);
  assert.match(html, /lang="es"/);
  assert.doesNotMatch(html, /Alex Morgan|Elegir A|variant=|datos ficticios/i);
});

test('shows supported administration links only for admins, without a nonexistent panel', async () => {
  const regular = await fixture.render();
  assert.doesNotMatch(regular, /href="\/admin"|href="\/api\/auth\/reference"/);
  const admin = await fixture.render({ ...exampleUser, role: 'admin' });
  assert.doesNotMatch(admin, /href="\/admin"/);
  assert.match(admin, /href="\/api\/auth\/reference"/);
});

test('escapes profile text, handles missing names/images and does not invent verified status', async () => {
  const html = await fixture.render({ ...exampleUser, name: '<img src=x onerror=alert(1)>', emailVerified: false });
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /Correo verificado/);
  const fallback = await fixture.render({ email: 'fallback@example.invalid', image: null, name: null });
  assert.match(fallback, /fallback@example.invalid/);
  assert.doesNotMatch(fallback, /undefined|null/);
});

test('sessions replace the notes panel and navigation points to real pages', async () => {
  const html = await fixture.render();
  for (const path of ['/dashboard', '/settings/security', '/settings/sessions', '/settings/organizations']) {
    assert.ok(html.includes(`href="${path}"`), path);
  }
  assert.match(html, /Sesiones activas/);
  assert.match(html, /Gestionar sesiones/);
  assert.doesNotMatch(html, /data-notes|noteTitle|#local-notes|#account-security/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.match(html, /href="#dashboard-main"/);
  assert.doesNotMatch(html, /Encrypted|Secure Notes/);
});

test('route retains the existing session lookup, anonymous redirect and localhost condition', async () => {
  const route = await readFile(new URL('../src/pages/dashboard.astro', import.meta.url), 'utf8');
  assert.ok(route.includes("['localhost', '127.0.0.1', '::1'].includes(Astro.url.hostname)"));
  assert.ok(route.includes('auth.api.getSession({ headers: Astro.request.headers })'));
  assert.match(route, /if \(!session\?\.user\)\s*\{\s*return Astro.redirect\('\/'\)/);
  assert.doesNotMatch(route, /isLocal[^;]*auth\.localhost/);
  assert.doesNotMatch(route, /innerHTML|data-secret/);
});
