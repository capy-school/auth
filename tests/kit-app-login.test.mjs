import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
let temporary;
let Login;
let html;
let networkCalls = 0;

// Compile only owned components, without a Kit sync/build or shared output.
before(async () => {
  const temporaryRoot = process.env.OPENCODE_TMP_DIR || join(tmpdir(), 'opencode');
  await mkdir(temporaryRoot, { recursive: true });
  temporary = await mkdtemp(join(temporaryRoot, 'kit-core-login-'));
  const fixture = join(temporary, 'LoginFixture.svelte');
  await writeFile(fixture, `<script>
    import LoginPortal from '${join(root, 'src/lib/portal/LoginPortal.svelte')}';
    import LoginForm from '${join(root, 'src/lib/portal/LoginForm.svelte')}';
  </script><LoginPortal><LoginForm /></LoginPortal>`);
  const bundled = await build({
    entryPoints: [fixture], bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'import.meta.env': JSON.stringify({ DEV: false }) },
    plugins: [{
      name: 'isolated-svelte-server-compile',
      setup(builder) {
        builder.onResolve({ filter: /^(?:svelte(?:\/.*)?|better-auth\/.*)$/ }, args => ({ path: fileURLToPath(import.meta.resolve(args.path)), external: true }));
        builder.onLoad({ filter: /\.svelte$/ }, async args => ({ contents: compile(await readFile(args.path, 'utf8'), { filename: args.path, generate: 'server' }).js.code, loader: 'js', resolveDir: dirname(args.path) }));
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      },
    }],
  });
  const output = join(temporary, 'render.mjs');
  await writeFile(output, bundled.outputFiles[0].contents);
  const fetcher = globalThis.fetch;
  globalThis.fetch = async () => { networkCalls++; throw new Error('No build-time auth requests permitted'); };
  try {
    Login = (await import(pathToFileURL(output).href)).default;
    html = render(Login).body;
  } finally { globalThis.fetch = fetcher; }
});
after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

test('real login prerenders approved portal A geometry, typography, text and six provider identities without requests', () => {
  assert.equal(networkCalls, 0);
  for (const className of ['login-page', 'login-masthead', 'portal-main', 'portal-story', 'portal-art', 'portal-bloom', 'portal-login', 'providers']) assert.match(html, new RegExp(`class="[^"]*\\b${className}\\b`));
  for (const text of ['Tus espacios.', 'Un solo acceso.', 'HECHO PARA VOLVER', 'Un gusto tenerte aquí.', 'Elige cómo quieres continuar.', 'Continuar con correo', 'Entrar con una passkey', 'Un solo lugar para volver a tus aplicaciones.']) assert.ok(html.includes(text), text);
  assert.match(html, /viewBox="0 0 640 540"/);
  assert.match(html, /m184 106 209-47q12-3 12 11v360q0 12-12 15l-209 47q-12 3-12-11V122q0-13 12-16Z/);
  for (const id of ['login-frame-light', 'login-opening', 'login-floor-light', 'login-light-bloom', 'login-close-bloom']) assert.ok(html.includes(`id="${id}"`), id);
  assert.deepEqual([...html.matchAll(/data-provider="([^"]+)"/g)].map(([, value]) => value), ['google', 'github', 'microsoft', 'kakao', 'naver', 'line']);
  assert.doesNotMatch(html, /__migration|presentation preview|fictional|John Doe/i);
  assert.match(html, /class="brand-light"> Gateway<\/span>/, 'Preserve the space in Login Gateway across the inline typography spans');
});

test('all initial controls are natively disabled until hydration and validation, email is POST and noscript explains access', () => {
  assert.match(html, /<section\b[^>]*aria-busy="true"/);
  assert.match(html, /<form\b[^>]*class="email-form"[^>]*method="post"/);
  const input = html.match(/<input\b[^>]*>/)?.[0];
  assert.ok(input);
  for (const attribute of ['id="login-email"', 'name="email"', 'type="email"', 'autocomplete="email webauthn"', 'aria-describedby="login-email-note"']) assert.ok(input.includes(attribute), attribute);
  assert.match(input, /\bdisabled\b/);
  assert.match(input, /\brequired\b/);
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)];
  assert.equal(buttons.length, 9);
  for (const [, attributes] of buttons) assert.match(attributes, /\bdisabled\b/);
  assert.match(html, /<noscript><p class="field-note">Activa JavaScript para acceder a tu cuenta\.<\/p><\/noscript>/);
  assert.match(html, /<button\b[^>]*disabled[^>]*>Usar un código de correo<\/button>/);
  assert.match(html, /No configurado/);
});

test('provider markup preserves approved AuthButton utility classes, icons and native types', () => {
  for (const provider of ['google', 'github', 'microsoft', 'kakao', 'naver', 'line']) {
    const attributes = html.match(new RegExp(`<button\\b[^>]*data-provider="${provider}"[^>]*>`))?.[0];
    assert.ok(attributes, provider);
    assert.match(attributes, /type="button"/);
    assert.match(attributes, /bg-gradient-to-br/);
  }
  assert.match(html, /fill="#f25022"/);
  assert.match(html, /auth-icon w-4 h-4 shrink-0/);
  assert.match(html, /aria-label="Otros métodos de acceso"/);
  // Match the installed Lucide source used by the approved React gateway.
  assert.match(html, /d="M14 13\.12c0 2\.38 0 6\.38-1 8\.88"/);
  assert.match(html, /d="m22 7-8\.991 5\.727a2 2 0 0 1-2\.009 0L2 7"/);
  for (const icon of ['mail', 'arrow-right', 'fingerprint']) assert.ok(html.includes(`class="lucide lucide-${icon}"`), `Preserve Lucide ${icon} classes`);
});

test('owned components compile cleanly for both prerender and browser hydration', async () => {
  for (const name of ['LoginPortal', 'LoginForm', 'ProviderIcon', 'AuthButton']) {
    const filename = `src/lib/portal/${name}.svelte`;
    const source = await read(filename);
    for (const generate of ['server', 'client']) {
      const result = compile(source, { filename, generate });
      assert.deepEqual(result.warnings, [], `${filename} (${generate})`);
    }
  }
});

test('production composition uses the real client, isolated local opt-in, mount lifecycle and existing stylesheet', async () => {
  const form = await read('src/lib/portal/LoginForm.svelte');
  assert.match(form, /import\s*\{\s*authClient\s*\}\s*from/);
  assert.match(form, /\bonMount\(/);
  assert.match(form, /PUBLIC_KIT_AUTH_LOCAL_MODE/);
  assert.doesNotMatch(form, /PUBLIC_AUTH_URL|PUBLIC_AUTH_LOCAL_MODE|alert\(|console\.log/);
  for (const operation of ['readSession', 'validateLoginQuery', 'continuationTarget', 'signInOAuth', 'signInMagicLink', 'signInPasskey']) assert.match(form, new RegExp(`\\b${operation}\\(`));
  assert.match(form, /isConditionalMediationAvailable/);
  assert.match(form, /data-local-preview/);
  assert.match(form, /href="\/dev\/inbox"/);
  assert.match(form, /login-local-social-note/);
  assert.match(await read('src/lib/portal/LoginPortal.svelte'), /styles\/login\.css/);
});
