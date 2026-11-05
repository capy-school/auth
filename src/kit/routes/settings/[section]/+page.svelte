<script lang="ts">
  import AccountPage from '$lib/account/AccountPage.svelte';
  let { data }: { data: { section: 'security' | 'sessions' | 'passkey' | '2fa' | 'api-keys' | 'organizations' } } = $props();
</script>

{#key data.section}
  <AccountPage page={data.section === '2fa' ? 'two-factor' : data.section} />
{/key}
