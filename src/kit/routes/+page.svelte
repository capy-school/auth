<script lang="ts">
  import { page } from '$app/state';
  import LoginPortal from '$lib/portal/LoginPortal.svelte';
  import LoginForm from '$lib/portal/LoginForm.svelte';
</script>

<svelte:head>
  <title>Login Gateway</title>
  <meta name="description" content="Tus espacios. Un solo acceso." />
</svelte:head>

<LoginPortal>
  {#key page.url.search}
    <LoginForm />
  {/key}
</LoginPortal>
