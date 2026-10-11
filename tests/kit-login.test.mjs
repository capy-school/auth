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
let EmailSignIn;
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
  EmailSignIn = (await server.ssrLoadModule('/src/kit/lib/login/EmailSignIn.svelte')).default;
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

const emailCallbacks = { onRevealEmail() {}, onEmailChange() {}, onMagicLink() {}, onEmailOTP() {} };
const emailBody = (props = {}) => render(EmailSignIn, { props: {
  email: '', showEmailInput: false, ...props,
} }).body;
const controlLabels = (html) => buttons(html).map(([, , content]) => content
  .replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '').trim());
const assertEditable = (html) => {
  const input = html.match(/<input\b[^>]*>/)?.[0];
  assert.ok(input, 'expanded email input exists');
  assert.doesNotMatch(input, /\bdisabled\b|\breadonly\b/);
};

test('collapsed email renders only the original disclosure label, style and Mail icon', () => {
  const html = emailBody(emailCallbacks);
  assert.deepEqual(controlLabels(html), ['Sign in with Email']);
  assert.match(html, /Passwordless/);
  assert.match(buttons(html)[0][1], /type="button"/);
  assert.doesNotMatch(buttons(html)[0][1], /\bdisabled\b/);
  assert.match(html, /from-purple-500 to-purple-600/);
  assert.match(html, /aria-hidden="true" class="auth-icon w-4 h-4 shrink-0"/);
  assert.match(html, /m22 7-8\.991 5\.727/);
  assert.doesNotMatch(html, /<input\b|Magic Link|Email OTP|<form\b/);
});

test('errors or a missing reveal callback natively disable email disclosure', () => {
  for (const props of [{}, { ...emailCallbacks, errors: ['Missing app'] }]) {
    const html = emailBody(props);
    assert.match(buttons(html)[0][1], /\bdisabled\b/);
    assert.match(buttons(html)[0][1], /opacity-50 pointer-events-none/);
    assert.doesNotMatch(html, /<input\b/);
  }
});

test('expanded email preserves the raw address, input attributes and original method presentation', () => {
  const html = emailBody({ ...emailCallbacks, showEmailInput: true, email: '  Fixture+Tag@Example.invalid  ' });
  assertEditable(html);
  assert.match(html, /type="email"/);
  assert.match(html, /aria-label="Email address"/);
  assert.match(html, /placeholder="Enter your email"/);
  assert.match(html, /autocomplete="email webauthn"/);
  assert.match(html, /value="  Fixture\+Tag@Example\.invalid  "/);
  assert.match(html, /bg-gray-700\/50 border border-gray-600/);
  assert.match(html, /focus:ring-purple-500/);
  assert.deepEqual(controlLabels(html), ['Magic Link', 'Email OTP']);
  for (const [, attributes, content] of buttons(html)) {
    assert.match(attributes, /type="button"/);
    assert.doesNotMatch(attributes, /\bdisabled\b/);
    assert.match(content, /aria-hidden="true"/);
  }
  assert.match(html, /bg-purple-600 hover:bg-purple-700/);
  assert.match(html, /bg-indigo-600 hover:bg-indigo-700/);
  assert.match(html, /m21 2-9\.6 9\.6/);
  assert.match(html, /M2\.586 17\.414/);
  assert.doesNotMatch(html, /Sign in with Email|<form\b/);
});

test('visible OTP explicitly warns that email service and Better Auth plugin configuration is required', () => {
  const html = emailBody({ ...emailCallbacks, showEmailInput: true });
  assert.match(html, /Email OTP feature - Configure email service and Better Auth plugin/);
  assert.doesNotMatch(html, /code sent|link sent|login success|signed in/i);
});

test('caller can model expanded local presentation with OTP hidden and no policy dependency', () => {
  const html = emailBody({ ...emailCallbacks, showEmailInput: true, showOTP: false });
  assertEditable(html);
  assert.deepEqual(controlLabels(html), ['Magic Link']);
  assert.doesNotMatch(html, /Sign in with Email|Email OTP|Configure email service|<a\b/);
});

test('expanded errors disable both methods but leave the raw input editable', () => {
  const html = emailBody({ ...emailCallbacks, email: '<invalid>', showEmailInput: true, errors: ['Missing app'] });
  assertEditable(html);
  assert.match(html, /value="&lt;invalid(?:>|&gt;)"/);
  assert.equal(buttons(html).length, 2);
  for (const [, attributes] of buttons(html)) {
    assert.match(attributes, /\bdisabled\b/);
    assert.match(attributes, /opacity-50 cursor-not-allowed/);
  }
});

test('missing method callbacks disable only the relevant buttons, never the input', () => {
  for (const [callbacks, disabled] of [
    [{}, [true, true]],
    [{ onMagicLink() {} }, [false, true]],
    [{ onEmailOTP() {} }, [true, false]],
    [emailCallbacks, [false, false]],
  ]) {
    const html = emailBody({ ...callbacks, showEmailInput: true, email: '' });
    assertEditable(html);
    assert.deepEqual(buttons(html).map(([, attributes]) => /\bdisabled\b/.test(attributes)), disabled);
    assert.doesNotMatch(html, /<form\b/);
  }
});

// SSR proves rendered states only; independent Chrome acceptance covers callback/keyboard wiring.
test('preview adds collapsed email disclosure while remaining noindex and disconnected', () => {
  const { body: html, head } = render(Preview);
  assert.match(head, /name="robots" content="noindex"/);
  assert.match(html, /Sign in with Email/);
  assert.match(html, /Login presentation preview only — authentication is not connected\./);
  assert.equal(buttons(html).length, 7);
  assert.doesNotMatch(html, /<input\b|<form\b|2FA Protected|login success|signed in/i);
});
