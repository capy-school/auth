<script lang="ts">
  import '../../../../styles/global.css';
  import LoginShell from '$lib/login/LoginShell.svelte';
  import OAuthProviders, { type OAuthProvider } from '$lib/login/OAuthProviders.svelte';
  import EmailSignIn from '$lib/login/EmailSignIn.svelte';

  let email = $state('');
  let showEmailInput = $state(false);
  let selected = $state<string | null>(null);
  const onProvider = (provider: OAuthProvider) => { selected = `${provider} selected`; };
  const onMagicLink = (address: string) => { selected = `Magic Link requested for ${address}`; };
  const onEmailOTP = (address: string) => { selected = `Email OTP requested for ${address}`; };
</script>

<svelte:head>
  <title>Login presentation preview</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen text-gray-100 antialiased animated-gradient">
  <div class="container mx-auto px-4 py-8">
    <p class="text-center text-sm text-gray-300">Login presentation preview only — authentication is not connected.</p>
    <LoginShell>
      <EmailSignIn
        {email}
        {showEmailInput}
        showOTP={true}
        onRevealEmail={() => { showEmailInput = true; }}
        onEmailChange={(value) => { email = value; }}
        {onMagicLink}
        {onEmailOTP}
      />
      <OAuthProviders {onProvider} />
      {#if selected}
        <p role="status" class="mt-4 text-sm text-gray-300">Preview only: {selected}; authentication not connected.</p>
      {/if}
    </LoginShell>
  </div>
</main>
