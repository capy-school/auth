import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

let server;
let render;
let PasskeyManager;
before(async () => {
  server = await createServer({
    configFile: false,
    envDir: 'src/kit',
    cacheDir: '.svelte-kit/passkeys-test-cache',
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { $lib: new URL('../src/kit/lib', import.meta.url).pathname } },
    plugins: [svelte({ configFile: false })],
    server: { middlewareMode: true, watch: null },
  });
  render = (await server.ssrLoadModule('svelte/server')).render;
  PasskeyManager = (await server.ssrLoadModule('/src/kit/lib/settings/PasskeyManager.svelte')).default;
});
after(async () => { await server?.close(); });

const callbacks = {
  onNameChange() {}, onAdd() {}, onStartEdit() {}, onEditNameChange() {},
  onSaveEdit() {}, onCancelEdit() {}, onDelete() {},
};
const rows = Object.freeze([
  Object.freeze({ id: 'fictional-a', name: 'Example device', createdAtLabel: 'Caller supplied date <raw>' }),
  Object.freeze({ id: 'fictional-b', name: null }),
  Object.freeze({ id: 'fictional-c', name: '' }),
  Object.freeze({ id: 'fictional-d' }),
]);
const body = (props = {}) => render(PasskeyManager, { props: {
  passkeys: [], name: 'My device', loading: false, error: null, editingId: null,
  editName: '', ...callbacks, ...props,
} }).body;
const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
const labels = (html) => buttons(html).map(([, , content]) => content.replace(/<[^>]*>/g, '').trim());
const inputs = (html) => [...html.matchAll(/<input\b(?:[^">]|"[^"]*")*>/g)].map(([input]) => input);
const assertControls = (html, expectedLabels, disabled) => {
  assert.deepEqual(labels(html), expectedLabels);
  for (const [, attributes] of buttons(html)) {
    assert.match(attributes, /type="button"/);
    assert.equal(/\bdisabled\b/.test(attributes), disabled);
  }
  for (const input of inputs(html)) assert.doesNotMatch(input, /\bdisabled\b|\breadonly\b/);
  assert.doesNotMatch(html, /<form\b|<a\b/);
};

test('ordinary empty presentation retains heading, optional raw name and original add styles', () => {
  const html = body({ name: '  <raw device>  ' });
  assert.match(html, /<h2 class="text-xl font-semibold text-white">Passkeys<\/h2>/);
  assert.match(html, /Register a passkey to enable passwordless sign-in\./);
  assert.match(html, /class="space-y-4"/);
  assert.match(html, /bg-gray-800\/50 border border-gray-700 rounded-xl p-4 space-y-3/);
  assert.match(inputs(html)[0], /value="  &lt;raw device(?:>|&gt;)  "/);
  assert.match(inputs(html)[0], /placeholder="Device name \(optional\)"/);
  assert.match(inputs(html)[0], /bg-gray-700\/50 border border-gray-600/);
  assert.match(inputs(html)[0], /focus:ring-indigo-500/);
  assert.match(buttons(html)[0][1], /bg-indigo-600 hover:bg-indigo-700/);
  assert.match(html, /No passkeys yet\./);
  assert.doesNotMatch(html, /Loading\.\.\.|<ul\b|text-red-400/);
  assertControls(html, ['Add Passkey'], false);
});

test('loading with no rows replaces only the empty message and disables add, not its input', () => {
  const html = body({ loading: true });
  assert.match(html, /Loading\.\.\./);
  assert.doesNotMatch(html, /No passkeys yet\.|<ul\b/);
  assertControls(html, ['Processing...'], true);
});

test('readonly rows preserve list styles, fallback names and escaped preformatted dates', () => {
  const html = body({ passkeys: rows });
  assert.match(html, /<ul class="space-y-2">/);
  assert.equal([...html.matchAll(/<li class="bg-gray-700\/40 rounded-lg px-3 py-2">/g)].length, 4);
  assert.match(html, /class="font-medium">Example device/);
  assert.equal([...html.matchAll(/Unnamed passkey/g)].length, 3);
  assert.match(html, /class="text-gray-400 text-xs">Created Caller supplied date &lt;raw(?:>|&gt;)/);
  assert.equal([...html.matchAll(/Created /g)].length, 1);
  assert.match(html, /bg-blue-600 hover:bg-blue-700/);
  assert.match(html, /bg-red-600 hover:bg-red-700/);
  assert.doesNotMatch(html, /No passkeys yet\.|Loading\.\.\./);
  assertControls(html, ['Add Passkey', ...rows.flatMap(() => ['Rename', 'Delete'])], false);
  assert.equal(rows[0].createdAtLabel, 'Caller supplied date <raw>');
});

test('loading with rows keeps the list visible while all original buttons are disabled', () => {
  const html = body({ passkeys: rows.slice(0, 1), loading: true });
  assert.match(html, /Example device/);
  assert.doesNotMatch(html, /No passkeys yet\.|Loading\.\.\./);
  assertControls(html, ['Processing...', 'Rename', 'Delete'], true);
});

test('errors coexist with empty, list and loading states without independently disabling controls', () => {
  for (const passkeys of [[], rows.slice(0, 1)]) {
    for (const loading of [false, true]) {
      const html = body({ passkeys, loading, error: '<fixture error>' });
      assert.match(html, /class="text-sm text-red-400">&lt;fixture error(?:>|&gt;)/);
      assert.doesNotMatch(html, /<fixture error>/);
      const expected = [loading ? 'Processing...' : 'Add Passkey'];
      if (passkeys.length) expected.push('Rename', 'Delete');
      assertControls(html, expected, loading);
    }
  }
});

test('caller editor state replaces only its row and retains raw editable input, Save and Cancel styles', () => {
  for (const loading of [false, true]) {
    const html = body({ passkeys: rows.slice(0, 2), editingId: 'fictional-a',
      editName: '  <rename>  ', loading, error: 'Still displayed' });
    assert.equal(inputs(html).length, 2);
    assert.match(inputs(html)[1], /value="  &lt;rename(?:>|&gt;)  "/);
    assert.match(inputs(html)[1], /placeholder="Passkey name"/);
    assert.match(inputs(html)[1], /bg-gray-600 border border-gray-500 text-sm text-white/);
    assert.match(html, /bg-green-600 hover:bg-green-700/);
    assert.match(html, /bg-gray-600 hover:bg-gray-500 text-white text-xs/);
    assert.match(html, /Unnamed passkey|Still displayed/);
    assert.doesNotMatch(html, /Example device|Created Caller supplied date|\bautofocus\b/);
    assertControls(html, [loading ? 'Processing...' : 'Add Passkey', 'Save', 'Cancel', 'Rename', 'Delete'], loading);
  }
});

test('unknown editing ID leaves display unchanged and rendering never invokes callbacks', () => {
  const requests = [];
  const observed = Object.fromEntries(Object.keys(callbacks).map(key => [key, (...args) => requests.push([key, ...args])]));
  const html = body({ passkeys: rows.slice(0, 1), editingId: 'absent', ...observed });
  assert.match(html, /Example device/);
  assertControls(html, ['Add Passkey', 'Rename', 'Delete'], false);
  assert.deepEqual(requests, []);
});

// These class contracts protect shrinkability; SSR cannot prove viewport layout.
test('add and rename inputs explicitly allow flex shrinking below intrinsic input width', () => {
  const html = body({ passkeys: rows.slice(0, 1), editingId: 'fictional-a' });
  assert.equal(inputs(html).length, 2);
  for (const input of inputs(html)) assert.match(input, /class="[^"]*\bmin-w-0\b/);
});

test('display row text can shrink and wrap without forcing Rename and Delete outside the row', () => {
  const html = body({ passkeys: rows });
  assert.match(html, /class="text-sm text-gray-200 flex-1 min-w-0 wrap-break-word"/);
  assertControls(html, ['Add Passkey', ...rows.flatMap(() => ['Rename', 'Delete'])], false);
});

// SSR covers states only; independent browser acceptance verifies raw callbacks and rename focus.
test('preview starts empty with visible transient fixtures and a disconnected fictional-data disclaimer', async () => {
  const Preview = (await server.ssrLoadModule('/src/kit/routes/__migration/passkeys/+page.svelte')).default;
  const { body: html, head } = render(Preview);
  assert.match(head, /<title>Passkey management preview<\/title>/);
  assert.match(head, /name="robots" content="noindex"/);
  assert.match(html, /Passkey management preview only — account management is not connected\./);
  assert.match(html, /Fictional data; requests are recorded only, never applied\./);
  assert.match(html, /container mx-auto px-4 py-8/);
  assert.match(html, /max-w-2xl mx-auto/);
  assert.match(html, /bg-gray-800\/50 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-gray-700/);
  assert.match(html, /Preview fixture/);
  assert.deepEqual([...html.matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map(([, text]) => text),
    ['Empty', 'Populated', 'Loading', 'Error', 'Loading with rows']);
  assert.match(html, /value="My device"/);
  assert.match(html, /No passkeys yet\./);
  assertControls(html, ['Add Passkey'], false);
  assert.doesNotMatch(html, /role="status"|Welcome Back|registration successful|passkey added/i);
});
