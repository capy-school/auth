import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const fixtureId = new URL('./kit-api-key-dialog-fixture.svelte', import.meta.url).pathname;
const fixture = `
<script>
  import NewApiKeyDialog from '../src/kit/lib/settings/NewApiKeyDialog.svelte';
  let props = $props();
</script>
<NewApiKeyDialog {...props}>
  {#snippet notice()}<p>Caller-supplied fictional notice</p>{/snippet}
</NewApiKeyDialog>`;
let server;
let render;
let Dialog;
let WithNotice;
before(async () => {
  server = await createServer({
    configFile: false,
    envDir: 'src/kit',
    cacheDir: '.svelte-kit/api-key-dialog-test-cache',
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { $lib: new URL('../src/kit/lib', import.meta.url).pathname } },
    plugins: [
      {
        name: 'rendered-api-key-dialog-fixture',
        resolveId: (id) => id === 'virtual:kit-api-key-dialog' ? fixtureId : undefined,
        load: (id) => id === fixtureId ? fixture : undefined,
      },
      svelte({ configFile: false }),
    ],
    server: { middlewareMode: true, watch: null },
  });
  render = (await server.ssrLoadModule('svelte/server')).render;
  Dialog = (await server.ssrLoadModule('/src/kit/lib/settings/NewApiKeyDialog.svelte')).default;
  WithNotice = (await server.ssrLoadModule('virtual:kit-api-key-dialog')).default;
});
after(async () => { await server?.close(); });

const props = {
  open: true, keyValue: 'FICTIONAL-NOT-A-KEY', copyLabel: 'Copy', onCopy() {}, onClose() {},
};
const body = (overrides = {}) => render(Dialog, { props: { ...props, ...overrides } }).body;
const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
const labels = (html) => buttons(html).map(([, , content]) => content.replace(/<[^>]*>/g, '').trim());
const overlay = (html) => html.match(/<div id="newKeyModal"[^>]*>/)?.[0] || '';
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Rendered states and source seams do not prove browser events, focus or mobile layout.
test('open dialog preserves original overlay, panel, check icon and retention warning', () => {
  const html = body();
  assert.doesNotMatch(overlay(html), /\bhidden\b/);
  assert.match(overlay(html), /fixed inset-0 bg-black\/50 backdrop-blur-sm z-50 flex items-center justify-center p-4/);
  assert.match(html, /bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full p-6/);
  assert.match(html, /flex items-start gap-3 mb-4/);
  assert.match(html, /p-2 bg-green-500\/20 rounded-lg/);
  assert.match(html, /w-6 h-6 text-green-400/);
  assert.match(html, /stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/);
  assert.match(html, /<h3 class="text-xl font-semibold text-white mb-1">API Key Generated<\/h3>/);
  assert.match(html, /Save this key securely\. You won't be able to see it again\./);
  assert.match(html, /bg-gray-900\/50 border border-gray-700 rounded-lg p-4 mb-4/);
  assert.match(html, /text-xs font-medium text-gray-400 uppercase">API Key/);
});

test('panel has exactly two native enabled buttons in Copy then saved-key order', () => {
  const html = body();
  assert.deepEqual(labels(html), ['Copy', "I've saved my key"]);
  for (const [, attributes] of buttons(html)) {
    assert.match(attributes, /type="button"/);
    assert.doesNotMatch(attributes, /\bdisabled\b|\bautofocus\b/);
  }
  assert.match(buttons(html)[0][1], /text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors/);
  assert.match(buttons(html)[1][1], /w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors/);
  assert.doesNotMatch(html, /<form\b|<a\b|<input\b/);
});

test('closed dialog stays hidden without clearing its caller-supplied value or label', () => {
  const html = body({ open: false, copyLabel: 'Copied!' });
  assert.match(overlay(html), /\bhidden\b/);
  assert.ok(html.includes(props.keyValue), 'Closing retains the supplied fixture in hidden presentation');
  assert.deepEqual(labels(html), ['Copied!', "I've saved my key"]);
});

test('displayed string is escaped, untruncated and retains break-all code rendering', () => {
  const raw = 'FICTIONAL-NOT-A-KEY-<img src=x onerror="fictional">&' + 'fictional'.repeat(24);
  const html = body({ keyValue: raw });
  const code = html.match(/<code id="newKeyValue"([^>]*)>([\s\S]*?)<\/code>/);
  assert.ok(code, 'Key presentation remains a code element');
  assert.match(code[1], /block text-sm font-mono text-green-400 break-all/);
  assert.doesNotMatch(code[1], /truncate|overflow-hidden|line-clamp/);
  const escaped = raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  assert.ok(code[2].replaceAll('&gt;', '>') === escaped, 'The full fixture is escaped as text');
  assert.ok(!html.includes('<img'), 'Displayed text never becomes an element');
});

test('caller controls both labels and optional in-panel notice; render invokes no callbacks', () => {
  let requests = 0;
  for (const open of [true, false]) {
    for (const copyLabel of ['Copy', 'Copied!']) {
      const observed = { ...props, open, copyLabel, onCopy: () => { requests++; }, onClose: () => { requests++; } };
      const html = render(WithNotice, { props: observed }).body;
      assert.deepEqual(labels(html), [copyLabel, "I've saved my key"]);
      const notice = html.indexOf('Caller-supplied fictional notice');
      assert.ok(notice > html.indexOf('API Key Generated') && notice < html.indexOf('newKeyValue'));
    }
  }
  assert.equal(requests, 0);
  assert.doesNotMatch(body(), /Caller-supplied fictional notice/);
});

test('component is controlled presentation with zero-argument callbacks and no invented integrations', () => {
  const component = source('src/kit/lib/settings/NewApiKeyDialog.svelte');
  assert.match(component, /copyLabel: 'Copy' \| 'Copied!'/);
  assert.match(component, /onCopy: \(\) => void/);
  assert.match(component, /onClose: \(\) => void/);
  assert.match(component, /onclick=\{\(\) => onCopy\(\)\}/);
  assert.match(component, /onclick=\{\(\) => onClose\(\)\}/);
  assert.match(component, /\{@render notice\?\.\(\)\}/);
  assert.deepEqual([...component.matchAll(/import[^;]+;/g)].map(([statement]) => statement),
    ["import type { Snippet } from 'svelte';"]);
  assert.doesNotMatch(component, /\{@html|\$state|\$effect|\$bindable|bind:|clipboard|navigator|setTimeout|setInterval|fetch\s*\(|storage|session|onkeydown|onkeyup|autofocus|use:|\.focus\(|<form\b/i);
});

test('fictional dialog preview renders initially open with an in-panel no-generation/no-copy notice', async () => {
  assert.ok(existsSync(new URL('../src/kit/routes/__migration/api-key-dialog/+page.svelte', import.meta.url)),
    'The fictional dialog preview is absent');
  const Preview = (await server.ssrLoadModule('/src/kit/routes/__migration/api-key-dialog/+page.svelte')).default;
  const { body: html, head } = render(Preview);
  assert.match(head, /name="robots" content="noindex"/);
  assert.match(html, /API Key Generated/);
  assert.match(html, /Fictional dialog fixture — no API key was generated\. Copy records a request only; nothing is copied\./);
  assert.ok(/<code\b[^>]*>FICTIONAL-NOT-A-KEY/.test(html), 'Only the fictional fixture is displayed');
  assert.doesNotMatch(overlay(html), /\bhidden\b/);
  assert.deepEqual(labels(html), ['Reopen fictional dialog (preview only)', 'Copy', "I've saved my key"]);
  assert.match(html, /container mx-auto px-4 py-8/);
  assert.match(html, /max-w-2xl mx-auto/);
  assert.match(html, /Reload resets this preview/);
  assert.ok(html.indexOf('Fictional dialog fixture') > html.indexOf('newKeyModal'));
  assert.ok(html.indexOf('Fictional dialog fixture') < html.indexOf('newKeyValue'));
  assert.doesNotMatch(html, /Copied!|<a\b|<form\b|Welcome Back|2FA Protected|role="status"/);
  const preview = source('src/kit/routes/__migration/api-key-dialog/+page.svelte');
  assert.match(preview, /copyLabel="Copy"/);
  assert.match(preview, /onCopy=\{\(\) => \{ copyRequests\+\+; \}\}/);
  assert.match(preview, /onClose=\{\(\) => \{ dismissals\+\+; open = false; \}\}/);
  assert.match(preview, /onclick=\{\(\) => \{ open = true; \}\}/);
  assert.match(preview, /const fictionalValue = 'FICTIONAL-NOT-A-KEY/);
  assert.equal([...preview.matchAll(/fictionalValue/g)].length, 2, 'Fixture occurs only in declaration and display prop');
  assert.deepEqual([...preview.matchAll(/import[^;]+;/g)].map(([statement]) => statement), [
    "import '../../../../styles/global.css';",
    "import NewApiKeyDialog from '$lib/settings/NewApiKeyDialog.svelte';",
  ]);
  assert.doesNotMatch(preview, /\{@html|clipboard|navigator|Copied!|setTimeout|setInterval|fetch\s*\(|storage|session|\$app\/|<form\b|<a\b/i);
});
