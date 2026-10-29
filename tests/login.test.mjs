import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginFixture } from './helpers/login-fixture.mjs';

test('immersive portal provides the approved static composition without changing authentication', async () => {
  const fixture = await loginFixture();
  try {
    const html = await fixture.render();
    assert.match(html, /class="login-page"/);
    assert.match(html, /Tus espacios\./);
    assert.match(html, /Un solo acceso\./);
    assert.match(html, /portal-art/);
    assert.doesNotMatch(html, /comparison-bar|preview-notice|variant=/);
  } finally { await fixture.close(); }
});
