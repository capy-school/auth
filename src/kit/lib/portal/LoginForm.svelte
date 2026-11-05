<script lang="ts">
  import { onMount } from 'svelte';
  import { APPS } from '../../../lib/apps';
  import { authClient } from '../../../lib/auth-client';
  import { createLoginPolicy, validateLoginQuery, continuationTarget, rememberLogin, safeStorage, callbackDestination, type LoginPolicy, type LoginQuery } from '../auth/policy';
  import { readSession } from '../auth/session';
  import { signInOAuth, signInMagicLink, signInPasskey } from '../auth/login';
  import AuthButton from './AuthButton.svelte';

  let email = $state('');
  let hydrated = $state(false);
  let busy = $state(false);
  let policy = $state<LoginPolicy | null>(null);
  let query = $state<LoginQuery>({ app: null, redirect: null, target: null, errors: [] });
  let operationError = $state('');
  let notice = $state('');
  let sessionError = $state(false);
  const local = $derived(policy?.local ?? null);
  const signInDisabled = $derived(!hydrated || query.errors.length > 0 || busy);
  const socialDisabled = $derived(signInDisabled || !!local);
  const destinationOrigin = $derived(query.redirect && !query.errors.length ? new URL(query.redirect).origin : null);
  const storage = safeStorage(() => window.localStorage);
  let disposed = false;
  let sessionController: AbortController | undefined;

  const navigate = (destination: string) => { if (!disposed) window.location.assign(destination); };
  const message = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar el acceso. Inténtalo de nuevo.';

  async function checkSession() {
    if (!policy || query.errors.length || disposed) return null;
    sessionError = false;
    try {
      const session = await readSession(fetch, sessionController?.signal);
      if (disposed) return null;
      if (session.state === 'authenticated') {
        const target = continuationTarget(window.location.search, storage, policy);
        if (target) navigate(callbackDestination(target, policy));
      }
      return session;
    } catch {
      if (!disposed) sessionError = true;
      return null;
    }
  }

  onMount(() => {
    sessionController = new AbortController();
    try {
      policy = createLoginPolicy(APPS, import.meta.env.DEV, import.meta.env.PUBLIC_KIT_AUTH_LOCAL_MODE, window.location.origin);
      query = validateLoginQuery(window.location.search, policy);
      rememberLogin(query, storage);
    } catch (error) {
      query = { app: null, redirect: null, target: null, errors: [message(error)] };
    }
    hydrated = true;
    if (!query.errors.length) void (async () => {
      const session = await checkSession();
      if (disposed || session?.state !== 'anonymous' || !policy || local) return;
      const credential = window.PublicKeyCredential;
      if (typeof credential?.isConditionalMediationAvailable !== 'function') return;
      try {
        if (!await credential.isConditionalMediationAvailable() || disposed) return;
        const target = continuationTarget(window.location.search, storage, policy);
        if (target) await signInPasskey(authClient, target, policy, navigate, true);
      } catch { /* Conditional mediation is optional; explicit passkey remains available. */ }
    })();
    return () => { disposed = true; sessionController?.abort(); };
  });

  async function run(operation: (target: string, currentPolicy: LoginPolicy) => Promise<void>) {
    if (signInDisabled || !policy) return;
    const target = continuationTarget(window.location.search, storage, policy);
    if (!target) return;
    rememberLogin(query, storage);
    busy = true;
    operationError = '';
    notice = '';
    try { await operation(target, policy); }
    catch (error) { if (!disposed) operationError = message(error); }
    finally { if (!disposed) busy = false; }
  }

  const oauth = (provider: string) => { void run((target, currentPolicy) => signInOAuth(authClient, provider, target, currentPolicy)); };
  const passkey = () => { void run((target, currentPolicy) => signInPasskey(authClient, target, currentPolicy, navigate)); };
  const magicLink = () => { void run(async (target, currentPolicy) => {
    await signInMagicLink(authClient, email, target, currentPolicy);
    if (!disposed) notice = currentPolicy.local ? 'Magic link ready. Open the local inbox.' : 'Magic link sent. Check your email.';
  }); };
</script>

<section class="portal-login" aria-labelledby="login-heading" aria-busy={!hydrated || busy}>
  <noscript><p class="field-note">Activa JavaScript para acceder a tu cuenta.</p></noscript>
  {#if query.errors.length || operationError}
    <div class="login-errors" role="alert">
      <p>No se puede continuar:</p>
      <ul>
        {#each query.errors as error}<li>{error}</li>{/each}
        {#if operationError}<li>{operationError}</li>{/if}
      </ul>
    </div>
  {/if}
  {#if sessionError}
    <div class="login-errors" role="alert">
      <p>No se pudo comprobar la sesión. Puedes reintentar o elegir cómo acceder.</p>
      <button type="button" onclick={() => { void checkSession(); }}>Reintentar</button>
    </div>
  {/if}
  {#if notice}<p class="field-note" role="status">{notice}</p>{/if}

  <div class="login-heading">
    <p class="section-index">01 / ACCESO</p>
    <h2 id="login-heading">Un gusto tenerte aquí.</h2>
    <p>Elige cómo quieres continuar.</p>
    {#if query.app && !query.errors.length}
      <div class="login-app">
        <p>Acceder a <strong>{query.app.name}</strong></p>
        <p>{query.app.description}</p>
        {#if destinationOrigin}<p class="login-destination">Destino: {destinationOrigin}</p>{/if}
      </div>
    {/if}
  </div>

  <form class="email-form" method="post" onsubmit={(event) => { event.preventDefault(); magicLink(); }}>
    <label for="login-email">Correo electrónico</label>
    <div class="email-field">
      <svg class="lucide lucide-mail" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" /><rect x="2" y="4" width="20" height="16" rx="2" /></svg>
      <input id="login-email" name="email" type="email" placeholder="nombre@ejemplo.com" bind:value={email} autocomplete="email webauthn" aria-describedby="login-email-note" spellcheck={false} disabled={signInDisabled} required />
    </div>
    <button type="submit" disabled={signInDisabled} class="primary-button">
      <span>Continuar con correo</span><svg class="lucide lucide-arrow-right" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
    </button>
    <p class="field-note" id="login-email-note">Recibe un enlace para entrar sin contraseña.</p>
  </form>

  {#if local}
    <a href="/dev/inbox" target="_blank" rel="noreferrer" class="local-inbox" aria-label="Abrir bandeja local (se abre en otra pestaña)">Abrir bandeja local</a>
  {:else}
    <button type="button" class="passkey-button" onclick={passkey} disabled={signInDisabled}>
      <svg class="lucide lucide-fingerprint" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
        <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
        <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
        <path d="M2 12a10 10 0 0 1 18-6" />
        <path d="M2 16h.01" />
        <path d="M21.8 16c.2-2 .131-5.354 0-6" />
        <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
        <path d="M8.65 22c.21-.66.45-1.32.57-2" />
        <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
      </svg>
      <span>Entrar con una passkey</span><span class="key-corner" aria-hidden="true">↗</span>
    </button>
  {/if}
  <div class="method-divider"><span>O CON TU CUENTA</span></div>
  <div class="providers" role="group" aria-label="Otros métodos de acceso" data-local-preview={local ? 'true' : undefined} aria-describedby={local ? 'login-local-social-note' : undefined}>
    <AuthButton provider="google" disabled={socialDisabled} onclick={() => oauth('google')}>Google</AuthButton>
    <AuthButton provider="github" disabled={socialDisabled} onclick={() => oauth('github')}>GitHub</AuthButton>
    <AuthButton provider="microsoft" disabled={socialDisabled} onclick={() => oauth('microsoft')}>Microsoft</AuthButton>
    <AuthButton provider="kakao" disabled={socialDisabled} onclick={() => oauth('kakao')}>Kakao</AuthButton>
    <AuthButton provider="naver" disabled={socialDisabled} onclick={() => oauth('naver')}>Naver</AuthButton>
    <AuthButton provider="line" disabled={socialDisabled} onclick={() => oauth('line')}>LINE</AuthButton>
  </div>
  {#if local}
    <p class="field-note" id="login-local-social-note">En modo local, estos botones son solo visuales. El acceso social no está habilitado.</p>
  {:else}
    <div class="configuration-note">
      <button type="button" disabled>Usar un código de correo</button><span>No configurado</span>
    </div>
  {/if}
  <p class="login-footnote">Un solo lugar para volver a tus aplicaciones.</p>
</section>
