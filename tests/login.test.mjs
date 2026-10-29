import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { loginFixture } from './helpers/login-fixture.mjs';

let fixture;
before(async () => { fixture = await loginFixture(); });
after(async () => { await fixture?.close(); });

test('home renders the approved immersive A, in Spanish, without prototype controls', async () => {
  const html = await fixture.render();
  assert.match(html, /class="login-page"/);
  assert.match(html, /lang="es"/);
  assert.match(html, /Tus espacios\./);
  assert.match(html, /Un solo acceso\./);
  assert.match(html, /portal-art/);
  assert.match(html, /Un gusto tenerte aquí/);
  assert.doesNotMatch(html, /comparison-bar|preview-notice|data-preview-form|variant=|2FA Protected/);
});

test('email starts expanded with a visible label, real native form and autofill metadata', async () => {
  const html = await fixture.render();
  assert.match(html, /for="login-email"/);
  assert.match(html, /id="login-email"/);
  assert.match(html, /type="email"/);
  assert.match(html, /autoComplete="email webauthn"/i);
  assert.match(html, /<form[^>]*class="email-form"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /Continuar con correo/);
});

test('supported non-local methods retain all six providers and explicitly disable unconfigured OTP', async () => {
  const html = await fixture.render();
  const providers = [...html.matchAll(/data-provider="(google|github|microsoft|kakao|naver|line)"/g)].map(match => match[1]);
  assert.deepEqual(providers, ['google', 'github', 'microsoft', 'kakao', 'naver', 'line']);
  assert.match(html, /Entrar con una passkey/);
  assert.match(html, /<button[^>]*disabled[^>]*>Usar un código de correo/);
  assert.match(html, /No configurado/);
  assert.match(html, /fill="#f25022"/);
  assert.doesNotMatch(html, /Open local inbox/);
});

test('local mode shows disabled social previews while keeping email/inbox and hiding unsupported passkey/OTP', async () => {
  const local = await loginFixture({ local: true });
  try {
    const html = await local.render();
    assert.match(html, /id="login-email"/);
    assert.match(html, /href="\/dev\/inbox"/);
    const buttons = [...html.matchAll(/<button\b[^>]*data-provider="[^"]+"[^>]*>/g)].map(match => match[0]);
    assert.equal(buttons.length, 6);
    assert.ok(buttons.every(button => /\bdisabled\b/.test(button)));
    assert.match(html, /data-local-preview="true"/);
    assert.match(html, /aria-describedby="login-local-social-note"/);
    assert.match(html, /En modo local, estos botones son solo visuales/);
    assert.doesNotMatch(html, /Entrar con una passkey|Usar un código de correo/);
  } finally { await local.close(); }
});
