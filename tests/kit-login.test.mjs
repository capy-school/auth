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
  import EmailSignIn from '../src/kit/lib/login/EmailSignIn.svelte';
  import PasskeySignIn from '../src/kit/lib/login/PasskeySignIn.svelte';
  let {
    errors = [], appSummary, onProvider, button = false, disabled = false,
    passwordless = false, email = '', showEmailInput = false, showOTP = true,
    showPasskey = true, onPasskey,
  } = $props();
</script>
{#if button}
  <AuthButton provider="google" onclick={onProvider} {disabled}>
    {#snippet icon()}<svg><path d="M0 0" /></svg>{/snippet}
    Button label
  </AuthButton>
{:else if passwordless}
  <EmailSignIn {email} {showEmailInput} {showOTP} {errors}
    onRevealEmail={() => {}} onEmailChange={() => {}} onMagicLink={() => {}} onEmailOTP={() => {}}>
    {#snippet beforeEmail()}
      <PasskeySignIn {showPasskey} {errors} {onPasskey} />
    {/snippet}
  </EmailSignIn>
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
let PasskeySignIn;
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
  PasskeySignIn = (await server.ssrLoadModule('/src/kit/lib/login/PasskeySignIn.svelte')).default;
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

const passkeyBody = (props = {}) => render(PasskeySignIn, { props: { showPasskey: true, ...props } }).body;

test('visible passkey renders an enabled native button with original label, fingerprint and indigo style', () => {
  let requests = 0;
  const html = passkeyBody({ errors: Object.freeze([]), onPasskey: () => { requests += 1; } });
  assert.deepEqual(controlLabels(html), ['Sign in with Passkey']);
  const [, attributes, content] = buttons(html)[0];
  assert.match(attributes, /type="button"/);
  assert.doesNotMatch(attributes, /\bdisabled\b|opacity-50|pointer-events-none/);
  assert.match(attributes, /bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white/);
  assert.match(content, /aria-hidden="true" class="auth-icon w-4 h-4 shrink-0"/);
  assert.match(content, /viewBox="0 0 24 24"/);
  assert.match(content, /fill="none" stroke="currentColor" stroke-width="2"/);
  assert.match(content, /stroke-linecap="round" stroke-linejoin="round"/);
  const fingerprintPaths = [
    'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4',
    'M14 13.12c0 2.38 0 6.38-1 8.88',
    'M17.29 21.02c.12-.6.43-2.3.5-3.02',
    'M2 12a10 10 0 0 1 18-6',
    'M2 16h.01',
    'M21.8 16c.2-2 .131-5.354 0-6',
    'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2',
    'M8.65 22c.21-.66.45-1.32.57-2',
    'M9 6.8a6 6 0 0 1 9 5.2v2',
  ];
  assert.equal([...content.matchAll(/<path\b/g)].length, fingerprintPaths.length);
  for (const path of fingerprintPaths) assert.ok(content.includes(`d="${path}"`));
  assert.equal(requests, 0, 'SSR renders without invoking presentation callbacks');
  assert.doesNotMatch(html, /Passwordless|<input\b|<form\b|<a\b/);
});

test('caller hiding passkey renders nothing even with errors or an available callback', () => {
  for (const props of [{}, { onPasskey() {} }, { errors: Object.freeze(['Missing app']) }]) {
    const html = passkeyBody({ ...props, showPasskey: false });
    assert.equal(html.replace(/<!--[\s\S]*?-->/g, '').trim(), '');
  }
});

test('errors or missing passkey callback natively disable without mutating caller data', () => {
  for (const props of [{}, { onPasskey() {}, errors: Object.freeze(['Missing app']) }]) {
    const html = passkeyBody(props);
    assert.deepEqual(controlLabels(html), ['Sign in with Passkey']);
    assert.match(buttons(html)[0][1], /\bdisabled\b/);
    assert.match(buttons(html)[0][1], /opacity-50 pointer-events-none/);
    assert.doesNotMatch(html, /Missing app/);
    if (props.errors) assert.deepEqual(props.errors, ['Missing app']);
  }
});

test('collapsed and expanded snippets preserve one Passwordless heading followed by passkey then email', () => {
  for (const showEmailInput of [false, true]) {
    const html = body({ passwordless: true, showEmailInput, onPasskey() {} });
    assert.equal([...html.matchAll(/<h2\b[^>]*>Passwordless<\/h2>/g)].length, 1);
    assert.ok(html.indexOf('Passwordless') < html.indexOf('Sign in with Passkey'));
    assert.ok(html.indexOf('Sign in with Passkey') < html.indexOf(showEmailInput ? '<input' : 'Sign in with Email'));
    assert.deepEqual(controlLabels(html), ['Sign in with Passkey', ...(showEmailInput
      ? ['Magic Link', 'Email OTP'] : ['Sign in with Email'])]);
    if (showEmailInput) {
      assertEditable(html);
      assert.match(html, /Email OTP feature - Configure email service and Better Auth plugin/);
    }
  }
});

test('caller can hide passkey in expanded local composition and errors still disable every method', () => {
  const local = body({ passwordless: true, showEmailInput: true, showPasskey: false, showOTP: false });
  assertEditable(local);
  assert.deepEqual(controlLabels(local), ['Magic Link']);
  assert.doesNotMatch(local, /Sign in with Passkey|Email OTP/);
  for (const showEmailInput of [false, true]) {
    const html = body({ passwordless: true, showEmailInput, onPasskey() {}, errors: ['Missing app'] });
    for (const [, attributes] of buttons(html)) assert.match(attributes, /\bdisabled\b/);
    if (showEmailInput) assertEditable(html);
  }
});

// SSR proves rendered states only; independent Chrome acceptance covers callback/keyboard wiring.
test('preview renders eight ordered controls while remaining noindex and disconnected', () => {
  const { body: html, head } = render(Preview);
  assert.match(head, /name="robots" content="noindex"/);
  assert.match(html, /Login presentation preview only — authentication is not connected\./);
  assert.deepEqual(controlLabels(html), ['Sign in with Passkey', 'Sign in with Email', ...labels]);
  for (const [, attributes] of buttons(html)) {
    assert.match(attributes, /type="button"/);
    assert.doesNotMatch(attributes, /\bdisabled\b/);
  }
  assert.equal([...html.matchAll(/<h2\b[^>]*>Passwordless<\/h2>/g)].length, 1);
  assert.ok(html.indexOf('Passwordless') < html.indexOf('Sign in with Passkey'));
  assert.doesNotMatch(html, /<input\b|<form\b|role="status"|Passkey requested|2FA Protected|login success|signed in/i);
});
