<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createLogout, type LogoutState } from '$lib/account/lifecycle';
  import '../../styles/dashboard.css';
  let logoutState = $state<LogoutState>('idle');
  let submit = $state<(() => Promise<void>) | undefined>();
  onMount(() => {
    const logout = createLogout({
      signOut: async () => { const { authClient } = await import('$lib/auth-client'); return authClient.signOut(); },
      update: value => { logoutState = value; },
      redirect: path => goto(path, { replaceState: true }),
    });
    submit = logout.submit;
    return () => { logout.destroy(); };
  });
</script>

<svelte:head><title>Cerrar sesión - Login Gateway</title><meta name="robots" content="noindex, nofollow" /></svelte:head>

<div class="dashboard-page">
  <main class="dashboard-main" id="dashboard-main" tabindex="-1">
    <header class="dashboard-heading"><h1>Cerrar sesión</h1><p>¿Quieres cerrar la sesión de este dispositivo?</p></header>
    <p class="account-error" data-sign-out-error role="alert" hidden={logoutState !== 'error'}>No se ha podido cerrar la sesión. Vuelve a intentarlo.</p>
    <div class="account-actions">
      <button class="account-button is-danger" type="button" disabled={!submit || logoutState === 'loading'} data-sign-out onclick={() => { void submit?.(); }}>{logoutState === 'loading' ? 'Cerrando sesión…' : logoutState === 'error' ? 'Volver a intentar' : 'Cerrar sesión'}</button>
      <a class="account-text-link" href="/dashboard">Volver a mi cuenta</a>
    </div>
    <noscript><p class="account-notice">Activa JavaScript para cerrar tu sesión.</p></noscript>
  </main>
</div>
