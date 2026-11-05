<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { readSession } from '$lib/auth/session';
  import type { AccountUser } from '../../../components/account/types';
  import '../../../styles/dashboard.css';
  import { createAccountSession, type AccountState } from './lifecycle';
  import Icon from './Icon.svelte';

  let { active, title, description, children }: {
    active: 'overview' | 'security' | 'sessions' | 'organizations';
    title: string;
    description: string;
    children: Snippet<[AccountUser | null]>;
  } = $props();
  let session = $state<AccountState>({ state: 'loading' });
  let retry = $state<(() => Promise<void>) | undefined>();
  const user = $derived(session.state === 'authenticated' ? session.user : null);
  const name = $derived(user ? user.name?.trim() || user.email || 'Mi cuenta' : '');
  const initials = $derived(name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('').toLocaleUpperCase('es'));
  const navigation = [
    { id: 'overview', href: '/dashboard', icon: 'grid', label: 'Resumen' },
    { id: 'security', href: '/settings/security', icon: 'shield', label: 'Seguridad' },
    { id: 'sessions', href: '/settings/sessions', icon: 'device', label: 'Sesiones' },
    { id: 'organizations', href: '/settings/organizations', icon: 'building', label: 'Organizaciones' },
  ] as const;
  const section = $derived(navigation.find(item => item.id === active)!);

  onMount(() => {
    const check = createAccountSession({ read: signal => readSession(fetch, signal), update: state => { session = state; }, redirect: path => goto(path, { replaceState: true }) });
    retry = check.retry;
    void check.retry();
    return () => { check.destroy(); };
  });
</script>

<svelte:head><title>{title} - Login Gateway</title><meta name="robots" content="noindex, nofollow" /></svelte:head>

<div class="dashboard-page">
  <a class="dashboard-skip" href="#dashboard-main">Saltar al contenido</a>
  <div class="dashboard-shell">
    <aside class="dashboard-sidebar">
      <a class="dashboard-wordmark" href="/dashboard" aria-label="Login Gateway, mi cuenta"><span class="dashboard-mark"><Icon name="key" /></span>Login Gateway</a>
      <p class="dashboard-eyebrow">Tu espacio</p>
      <nav class="dashboard-navigation" aria-label="Mi cuenta">
        {#each navigation as item}<a class:is-current={item.id === active} href={item.href} aria-current={item.id === active ? 'page' : undefined}><Icon name={item.icon} />{item.label}</a>{/each}
      </nav>
      <div class="dashboard-sidebar-account" hidden={!user} inert={!user}>
        <span class="dashboard-avatar dashboard-avatar-small" aria-hidden="true">{initials}</span>
        <div><strong>{name}</strong><span>{user?.email || ''}</span></div>
      </div>
    </aside>
    <div class="dashboard-content">
      <header class="dashboard-topbar">
        <nav class="dashboard-breadcrumb" aria-label="Ubicación"><a href="/dashboard">Mi cuenta</a><span aria-hidden="true">/</span><a href={section.href}>{section.label}</a>{#if title !== section.label && active !== 'overview'}<span aria-hidden="true">/</span><span>{title}</span>{/if}</nav>
        <a class="dashboard-signout" href="/logout"><Icon name="out" />Cerrar sesión</a>
      </header>
      <main class="dashboard-main" id="dashboard-main" tabindex="-1">
        <header class="dashboard-heading"><h1>{title}</h1><p>{description}</p></header>
        <p class="account-loading" data-session-loading role="status" hidden={session.state !== 'loading' && session.state !== 'anonymous'}>{session.state === 'anonymous' ? 'Volviendo al inicio de sesión…' : 'Comprobando tu sesión…'}</p>
        <p class="account-error" data-session-error role="alert" hidden={session.state !== 'error'}>No se ha podido comprobar tu sesión. Vuelve a intentarlo.</p>
        <button class="account-button" data-session-retry type="button" hidden={session.state !== 'error'} disabled={!retry} onclick={() => { void retry?.(); }}>Volver a intentar</button>
        <noscript><p class="account-notice">Activa JavaScript para consultar y gestionar esta información.</p></noscript>
        <div data-account-protected hidden={!user} inert={!user}>
          {@render children(user)}
        </div>
      </main>
    </div>
  </div>
</div>
