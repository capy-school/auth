<script lang="ts">
  import '../../../../styles/global.css';
  import LoginShell from '$lib/login/LoginShell.svelte';
  import OAuthProviders, { type OAuthProvider } from '$lib/login/OAuthProviders.svelte';

  let selected = $state<OAuthProvider | null>(null);
  const onProvider = (provider: OAuthProvider) => { selected = provider; };
</script>

<svelte:head>
  <title>OAuth presentation preview</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen text-gray-100 antialiased animated-gradient">
  <div class="container mx-auto px-4 py-8">
    <p class="text-center text-sm text-gray-300">OAuth presentation preview only — authentication is not connected.</p>
    <LoginShell>
      <OAuthProviders {onProvider} />
      {#if selected}
        <p role="status" class="mt-4 text-sm text-gray-300">Preview only: {selected} selected; authentication not connected.</p>
      {/if}
    </LoginShell>
  </div>
</main>
