import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { dashboardFixture } from './helpers/dashboard-fixture.mjs';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';
import { accountState } from './helpers/account-state.mjs';

let fixture, browser, base;
before(async () => { fixture = await dashboardFixture(); base = new URL(await fixture.listen()).origin; browser = await dashboardChrome(); });
after(async () => { try { await browser?.close(); } finally { await fixture?.close(); } });
const evaluate = expression => browser.evaluate(expression);
async function visit(path, extra = '') {
  await browser.navigate(base + path, accountState + extra);
  await evaluate(`new Promise((resolve,reject)=>{let tries=0;const ready=()=>{if([...document.querySelectorAll('[data-manager]')].every(root=>root.dataset.accountReady==='true'))return resolve(true);if(++tries>180)return reject(new Error('Manager did not initialize'));requestAnimationFrame(ready)};ready()})`);
}
const paths = ["/dashboard","/settings/security","/settings/sessions","/settings/passkey"];

test('migrated account views retain the shared shell and usable mobile navigation', async () => {
  for (const width of [1440, 390, 320]) {
    await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const path of paths) {
      await visit(path);
      const result = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,links:[...document.querySelectorAll('.dashboard-navigation a')].map(a=>({href:a.getAttribute('href'),visible:a.getBoundingClientRect().height>0})),active:document.querySelectorAll('.dashboard-navigation [aria-current="page"]').length,background:getComputedStyle(document.body).backgroundImage,labels:[...document.querySelectorAll('input,select')].every(input=>input.labels.length>0)})`);
      assert.equal(result.overflow, false, `${path} overflow at ${width}`);
      assert.equal(result.active, 1);
      assert.equal(result.background, 'none');
      assert.equal(result.labels, true, `${path}: missing field label`);
      assert.deepEqual(result.links.map(link => link.href), ['/dashboard', '/settings/security', '/settings/sessions', '/settings/organizations']);
      assert.ok(result.links.every(link => link.visible), `${path}: hidden navigation at ${width}`);
      if ([1440, 390].includes(width)) {
        const { data } = await browser.page('Page.captureScreenshot', { format: 'png' });
        await writeFile(`/tmp/opencode/auth-account-${path.split('/').at(-1)}-${width}.png`, Buffer.from(data, 'base64'));
      }
    }
  }
});
test('visiting account pages never reads, rewrites or removes saved notes', async () => {
  await visit('/dashboard', `localStorage.setItem('secure_notes_data','old-notes-raw-value');`);
  for (const path of paths) {
    await browser.navigate(base + path, accountState);
    assert.equal(await evaluate(`localStorage.getItem('secure_notes_data')`), 'old-notes-raw-value');
    assert.equal(await evaluate(`document.querySelectorAll('[data-notes]').length`), 0);
  }
  await visit('/dashboard', `Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});`);
  assert.equal(await evaluate(`document.querySelectorAll('.account-row').length`), 2);
});
test('keyboard users get a visible skip link and an exposed empty success region', async () => {
  await visit('/settings/sessions');
  await browser.page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  await browser.page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
  assert.equal(await evaluate(`document.activeElement.className`), 'dashboard-skip');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');
  await browser.page('Accessibility.enable');
  const { result } = await browser.page('Runtime.evaluate', { expression: `document.querySelector('[role="status"]')` });
  const { nodes } = await browser.page('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false });
  assert.equal(nodes[0].ignored, false);
  assert.equal(nodes[0].role.value, 'status');
});
test('shared unfocused fields have at least 3:1 boundary contrast', async () => {
  await visit('/settings/passkey');
  const ratios = await evaluate(`(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true});const luminance=color=>{context.fillStyle=color;context.fillRect(0,0,1,1);const rgb=[...context.getImageData(0,0,1,1).data].slice(0,3).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};return [...document.querySelectorAll('input,select')].map(field=>{const style=getComputedStyle(field),first=luminance(style.borderTopColor),second=luminance(style.backgroundColor);return(Math.max(first,second)+.05)/(Math.min(first,second)+.05)})})()`);
  for (const ratio of ratios) assert.ok(ratio >= 3, `boundary contrast ${ratio.toFixed(2)}:1`);
});
