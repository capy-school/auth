import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { kitStaticFixture } from './helpers/kit-static-fixture.mjs';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';
import { auditLoginContrast } from './helpers/login-contrast-audit.mjs';

test('real Kit bundle preserves login A contrast across 108 states and produces desktop/mobile captures', async context => {
  const fixture = await kitStaticFixture();
  let browser;
  try {
    browser = await dashboardChrome();
    const directory = await mkdtemp('/tmp/opencode/auth-kit-login-captures-');
    const results = await auditLoginContrast(browser, fixture.origin, {
      screenshot: (width, data) => writeFile(`${directory}/${width}.png`, Buffer.from(data, 'base64')),
    });
    assert.equal(results.length, 108);
    assert.deepEqual(browser.exceptions, []);
    context.diagnostic(`108 combinations: text ${Math.min(...results.map(row=>row.text)).toFixed(2)}:1; boundary ${Math.min(...results.map(row=>row.boundary)).toFixed(2)}:1; captures ${directory}`);
  } finally { try { await browser?.close(); } finally { await fixture.close(); } }
});
