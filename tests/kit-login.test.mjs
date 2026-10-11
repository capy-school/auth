import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const labels = ['Google', 'GitHub', 'Microsoft', 'Kakao', 'Naver', 'Line'];
const fixtureId = new URL('./kit-login-fixture.svelte', import.meta.url).pathname;
const fixture = `
<script>
  import LoginShell from '../src/kit/lib/login/LoginShell.svelte';
  import OAuthProviders from '../src/kit/lib/login/OAuthProviders.svelte';
  import AuthButton from '../src/kit/lib/login/AuthButton.svelte';
  let { errors = [], appSummary, onProvider, button = false, disabled = false } = $props();
</script>
{#if button}
  <AuthButton provider="google" onclick={onProvider} {disabled}>
    {#snippet icon()}<svg><path d="M0 0" /></svg>{/snippet}
    Button label
  </AuthButton>
{:else}
  <LoginShell {errors} {appSummary}>
    <OAuthProviders {errors} {onProvider} />
    <p>Child presentation</p>
  </LoginShell>
{/if}`;
let server;
let render;
let Composition;
let Preview;
before(async () => {
  server = await createServer({
    configFile: false,
    envDir: 'src/kit',
    cacheDir: '.svelte-kit/login-test-cache',
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { $lib: new URL('../src/kit/lib', import.meta.url).pathname } },
    plugins: [
      {
        name: 'rendered-login-fixture',
        resolveId: (id) => id === 'virtual:kit-login' ? fixtureId : undefined,
        load: (id) => id === fixtureId ? fixture : undefined,
      },
      svelte({ configFile: false }),
    ],
    server: { middlewareMode: true, watch: null },
  });
  render = (await server.ssrLoadModule('svelte/server')).render;
  Composition = (await server.ssrLoadModule('virtual:kit-login')).default;
  Preview = (await server.ssrLoadModule('/src/kit/routes/__migration/login/+page.svelte')).default;
});
after(async () => { await server?.close(); });
const body = (props = {}) => render(Composition, { props }).body;
const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];

test('chooser renders the six original labels in order with enabled native buttons', () => {
  const html = body({ onProvider: () => {} });
  const controls = buttons(html);
  assert.equal(controls.length, 6);
  const label = (content) => content.replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '').trim();
  assert.deepEqual(controls.map(([, , content]) => label(content)), labels);
  for (const [, attributes, content] of controls) {
    assert.match(attributes, /type="button"/);
    assert.doesNotMatch(attributes, /\bdisabled\b/);
    assert.match(content, /<svg\b/);
  }
  assert.match(html, /Welcome Back/);
  assert.match(html, /Child presentation/);
});

test('errors are escaped and displayed, disable every provider and suppress app summary', () => {
  const html = body({ errors: ['Missing app', '<unsafe>'], appSummary: {
    name: 'Example app', description: 'Example description', destination: 'example.invalid',
  }, onProvider: () => {} });
  assert.match(html, /Unable to proceed:/);
  assert.match(html, /Missing app/);
  assert.match(html, /&lt;unsafe(?:>|&gt;)/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.doesNotMatch(html, /Example app|Example description|example\.invalid/);
  assert.equal(buttons(html).length, 6);
  for (const [, attributes] of buttons(html)) assert.match(attributes, /\bdisabled\b/);
});

test('without a callback the chooser remains natively disabled', () => {
  const controls = buttons(body());
  assert.equal(controls.length, 6);
  for (const [, attributes] of controls) assert.match(attributes, /\bdisabled\b/);
});

test('shell displays caller-supplied app summary only without errors', () => {
  const html = body({ appSummary: { name: 'Example app', description: 'Description', destination: 'Display only' } });
  assert.match(html, /Sign in to/);
  assert.match(html, /Example app/);
  assert.match(html, /Description/);
  assert.match(html, /Destination: Display only/);
  assert.doesNotMatch(body(), /Sign in to <span|Destination:/);
});

test('AuthButton renders child and icon snippets with explicit and missing-handler disabling', () => {
  for (const props of [{ disabled: true, onProvider: () => {} }, {}]) {
    const html = body({ button: true, ...props });
    assert.match(html, /Button label/);
    assert.match(html, /auth-icon/);
    assert.match(html, /<svg\b/);
    assert.match(buttons(html)[0][1], /\bdisabled\b/);
  }
});

test('preview is noindex and clearly disconnected without a success claim', () => {
  const { body: html, head } = render(Preview);
  assert.match(head, /name="robots" content="noindex"/);
  assert.match(html, /OAuth presentation preview only — authentication is not connected\./);
  assert.equal(buttons(html).length, 6);
  assert.doesNotMatch(html, /2FA Protected|login success|signed in/i);
});
