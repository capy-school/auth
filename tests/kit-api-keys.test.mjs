import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

let server;
let render;
let Manager;
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
before(async () => {
  server = await createServer({
    configFile: false,
    envDir: 'src/kit',
    cacheDir: '.svelte-kit/api-keys-test-cache',
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { $lib: new URL('../src/kit/lib', import.meta.url).pathname } },
    plugins: [svelte({ configFile: false })],
    server: { middlewareMode: true, watch: null },
  });
  render = (await server.ssrLoadModule('svelte/server')).render;
  if (existsSync(new URL('../src/kit/lib/settings/ApiKeyManager.svelte', import.meta.url))) {
    Manager = (await server.ssrLoadModule('/src/kit/lib/settings/ApiKeyManager.svelte')).default;
  }
});
after(async () => { await server?.close(); });

const rows = [
  { id: 'fictional-named', name: 'Fictional production', createdAtLabel: 'Caller date', expired: false },
  { id: 'fictional-empty', name: '', createdAtLabel: 'Expired fixture date', expired: true },
  { id: 'fictional-null', name: null, createdAtLabel: 'Null date', expired: false },
  { id: 'fictional-missing', createdAtLabel: 'Missing date', expired: true },
];
const props = { rows: [], listState: 'ready', name: '  Fictional name  ', onNameChange() {}, onCreateRequest() {}, onRevokeRequest() {} };
const body = (overrides = {}) => {
  assert.ok(Manager, 'Controlled API-key list/create presentation is absent');
  return render(Manager, { props: { ...props, ...overrides } }).body;
};
const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
const labels = (html) => buttons(html).map(([, , content]) => content.replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '').trim());

// SSR and source seams do not prove native validation, events, confirmation or mobile geometry.
test('fictional preview renders the original container with empty list and no initial requests', async () => {
  assert.ok(existsSync(new URL('../src/kit/routes/__migration/api-keys/+page.svelte', import.meta.url)),
    'The fictional API-key list/create preview is absent');
  const Preview = (await server.ssrLoadModule('/src/kit/routes/__migration/api-keys/+page.svelte')).default;
  const { body: html, head } = render(Preview);
  assert.match(head, /name="robots" content="noindex"/);
  assert.match(html, /container mx-auto px-4 py-8/);
  assert.match(html, /max-w-4xl mx-auto/);
  assert.match(html, /Fictional data and requests only — nothing is created or revoked\. Reload resets this preview\./);
  assert.match(html, /Security Notice and Active\/Expired badges describe fixtures, not account access or real key validity\./);
  for (const fixture of ['Empty', 'Loading', 'Populated', 'Hidden']) assert.match(html, new RegExp(`>${fixture}<`));
  assert.match(html, /No API Keys/);
  assert.deepEqual(labels(html), ['Generate Key']);
  assert.doesNotMatch(html, /<a\b|newKeyModal|role="status"|Preview request only/);
});

test('native required form retains original input, Generate label, classes and plus icon', () => {
  const html = body();
  assert.match(html, /<form id="apiKeyForm" class="mb-6">/);
  assert.match(html, /flex flex-col sm:flex-row gap-3/);
  const input = html.match(/<input\b[^>]*>/)?.[0] || '';
  assert.match(input, /id="keyName" type="text"/);
  assert.match(input, /placeholder="Key name \(e\.g\., Production API\)"/);
  assert.match(input, /\brequired\b/);
  assert.match(input, /value="  Fictional name  "/);
  assert.match(input, /flex-1 px-4 py-2\.5 bg-gray-700\/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all/);
  assert.match(buttons(html)[0][1], /type="submit"/);
  assert.match(buttons(html)[0][1], /px-6 py-2\.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2/);
  assert.match(html, /stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/);
  assert.doesNotMatch(html, /\bdisabled\b|novalidate|minlength|pattern=|<label\b/);
});

test('original heading and security notice retain their warning icon and styling', () => {
  const html = body();
  assert.match(html, /bg-gray-800\/50 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-gray-700/);
  assert.match(html, /<h1 class="text-3xl font-bold text-white mb-2">API Keys<\/h1>/);
  assert.match(html, /Manage your application API keys for programmatic access/);
  assert.match(html, /bg-gradient-to-br from-yellow-900\/20 to-orange-900\/20 border border-yellow-700\/50 rounded-lg p-4 mb-6/);
  assert.match(html, /w-5 h-5 text-yellow-400 flex-shrink-0 mt-0\.5/);
  assert.match(html, /M12 9v2m0 4h\.01m-6\.938 4h13\.856/);
  assert.match(html, /<h3 class="text-yellow-300 font-semibold mb-1">Security Notice<\/h3>/);
  assert.match(html, /API keys provide full access to your account\. Keep them secure and never share them publicly\./);
});

test('loading shows the original spinner while the native form remains enabled', () => {
  const html = body({ listState: 'loading', rows });
  assert.match(html, /id="apiKeysLoading" class="text-center py-12 text-gray-400"/);
  assert.match(html, /animate-pulse/);
  assert.match(html, /text-4xl mb-3">⏳/);
  assert.match(html, /Loading API keys\.\.\./);
  assert.deepEqual(labels(html), ['Generate Key']);
  assert.doesNotMatch(html, /No API Keys|data-key-id|\bdisabled\b/);
});

test('ready empty retains the empty icon and copy; hidden has no list or invented error', () => {
  const html = body();
  assert.match(html, /id="apiKeysEmpty" class="text-center py-12 text-gray-400 border border-gray-700 rounded-lg"/);
  assert.match(html, /text-6xl mb-3">🔑/);
  assert.match(html, /No API Keys/);
  assert.match(html, /Generate your first API key to get started/);
  const hidden = body({ listState: 'hidden', rows });
  assert.deepEqual(labels(hidden), ['Generate Key']);
  assert.doesNotMatch(hidden, /apiKeysLoading|apiKeysEmpty|apiKeysList|data-key-id|role="alert"|error/i);
});

test('ready rows preserve fallback names, caller dates, fixed masks, badges and enabled trash controls', () => {
  const html = body({ rows });
  assert.equal([...html.matchAll(/Unnamed Key/g)].length, 3);
  assert.match(html, /Created Caller date/);
  assert.match(html, /Created Expired fixture date/);
  assert.equal([...html.matchAll(/>••••••••••••••••<\/code>/g)].length, 4);
  assert.match(html, /bg-red-500\/20 text-red-400 border-red-500\/30 text-xs rounded border">Expired/);
  assert.match(html, /bg-green-500\/20 text-green-400 border-green-500\/30 text-xs rounded border">Active/);
  assert.match(html, /group bg-gray-700\/40 hover:bg-gray-700\/60 border border-gray-600\/50 rounded-lg p-4 transition-all/);
  assert.match(html, /font-semibold text-white truncate/);
  assert.match(html, /flex items-start justify-between gap-4 flex-wrap/);
  assert.match(html, /flex-1 min-w-0 basis-44/);
  assert.match(html, /flex items-center gap-2 flex-wrap/);
  assert.match(html, /text-sm font-mono text-gray-300 bg-gray-900\/50 px-3 py-1\.5 rounded border border-gray-700\/50 shrink-0/);
  assert.deepEqual(labels(html), ['Generate Key', '🗑️', '🗑️', '🗑️', '🗑️']);
  for (const [, attributes] of buttons(html).slice(1)) {
    assert.match(attributes, /type="button"/);
    assert.match(attributes, /title="Revoke key"/);
    assert.match(attributes, /delete-btn shrink-0 p-2 text-gray-400 hover:text-red-400 hover:bg-red-500\/10 rounded-lg transition-all/);
    assert.doesNotMatch(attributes, /disabled/);
  }
});

test('name and preformatted date are escaped text without normalization; SSR invokes zero callbacks', () => {
  let calls = 0;
  const raw = '<img src=x>&fictional';
  const observed = { onNameChange: () => { calls++; }, onCreateRequest: () => { calls++; }, onRevokeRequest: () => { calls++; } };
  for (const listState of ['loading', 'ready', 'hidden']) {
    const html = body({ ...observed, listState, rows: [{ id: 'fictional', name: raw, createdAtLabel: raw, expired: false }] });
    assert.doesNotMatch(html, /<img\b/);
    if (listState === 'ready') assert.equal([...html.matchAll(/&lt;img src=x(?:&gt;|>)&amp;fictional/g)].length, 2);
  }
  assert.match(body({ rows: [{ ...rows[0], name: '   ' }] }), /truncate">   <\/h3>/);
  assert.equal(calls, 0);
});

test('component and preview retain controlled raw requests, caller confirmation and isolation seams', () => {
  const component = source('src/kit/lib/settings/ApiKeyManager.svelte');
  assert.match(component, /rows: readonly ApiKeyRow\[\]/);
  assert.match(component, /listState: 'loading' \| 'ready' \| 'hidden'/);
  assert.match(component, /oninput=\{\(event\) => onNameChange\(event\.currentTarget\.value\)\}/);
  assert.match(component, /event\.preventDefault\(\);\s*if \(!name\.trim\(\)\) return;\s*onCreateRequest\(name\);/);
  assert.match(component, /onclick=\{\(\) => onRevokeRequest\(row\.id\)\}/);
  assert.doesNotMatch(component, /\{@html|\$state|\$effect|bind:|confirm|new Date|Date\.|keyValue|secret|import\b|disabled|novalidate|minlength|pattern=/);
  const preview = source('src/kit/routes/__migration/api-keys/+page.svelte');
  assert.match(preview, /if \(!window\.confirm\('Revoke this API key\? This action cannot be undone\.'\)\) return;\s*request = \{ action: 'Revoke', id \};/);
  assert.match(preview, /onCreateRequest=\{\(rawName\) => \{ request = \{ action: 'Create', rawName \}; \}\}/);
  assert.match(preview, /onNameChange=\{\(raw\) => \{ name = raw; \}\}/);
  assert.match(preview, /const rows = \$derived\(fixture === 'populated' \? fictionalRows : \[\]\)/);
  assert.match(preview, /const listState = \$derived\(fixture === 'loading' \? 'loading' : fixture === 'hidden' \? 'hidden' : 'ready'\)/);
  assert.match(preview, /onchange=\{\(event\) => \{ fixture = event\.currentTarget\.value as Fixture; \}\}/);
  assert.match(preview, /let name = \$state\(''\)/);
  assert.match(preview, /let request = \$state<PreviewRequest \| null>\(null\)/);
  assert.equal([...preview.matchAll(/fictionalRows/g)].length, 2, 'Fixture data is declared once and selected only by the fixture');
  assert.deepEqual([...preview.matchAll(/import[^;]+;/g)].map(([statement]) => statement), [
    "import '../../../../styles/global.css';",
    "import ApiKeyManager, { type ApiKeyRow } from '$lib/settings/ApiKeyManager.svelte';",
  ]);
  assert.doesNotMatch(component + preview, /NewApiKeyDialog|\{@html|navigator|clipboard|fetch\s*\(|storage|session|cookies|credentials|\$app\/|setTimeout|setInterval|<a\b|alert\(|\.filter\(|\.splice\(/i);
});
