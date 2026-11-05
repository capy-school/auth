<script lang="ts">
  import '../../../../styles/global.css';
  import ApiKeyManager, { type ApiKeyRow } from '$lib/settings/ApiKeyManager.svelte';

  type Fixture = 'empty' | 'loading' | 'populated' | 'hidden';
  type PreviewRequest = { action: 'Create'; rawName: string } | { action: 'Revoke'; id: string };
  const fictionalRows: readonly ApiKeyRow[] = [
    {
      id: 'fictional-named-active',
      name: 'Fictional application integration with a deliberately long display name for mobile truncation',
      createdAtLabel: 'Example date — not account data',
      expired: false,
    },
    { id: 'fictional-unnamed-expired', name: null, createdAtLabel: 'Another example date', expired: true },
  ];
  let fixture = $state<Fixture>('empty');
  let name = $state('');
  let request = $state<PreviewRequest | null>(null);
  const rows = $derived(fixture === 'populated' ? fictionalRows : []);
  const listState = $derived(fixture === 'loading' ? 'loading' : fixture === 'hidden' ? 'hidden' : 'ready');
  const onRevokeRequest = (id: string) => {
    if (!window.confirm('Revoke this API key? This action cannot be undone.')) return;
    request = { action: 'Revoke', id };
  };
</script>

<svelte:head>
  <title>API-key list/create preview</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen text-gray-100 antialiased animated-gradient">
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <div class="mb-6 space-y-3">
        <div class="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4 text-yellow-200">
          <p class="font-semibold">Fictional data and requests only — nothing is created or revoked. Reload resets this preview.</p>
          <p class="mt-2 text-sm">Security Notice and Active/Expired badges describe fixtures, not account access or real key validity.</p>
        </div>
        <label class="block text-sm text-gray-300">
          Preview fixture
          <select
            class="mt-1 block rounded-lg bg-gray-700 border border-gray-600 px-3 py-2 text-white"
            value={fixture}
            onchange={(event) => { fixture = event.currentTarget.value as Fixture; }}
          >
            <option value="empty">Empty</option>
            <option value="loading">Loading</option>
            <option value="populated">Populated</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
      </div>
      <ApiKeyManager
        {rows} {listState} {name}
        onNameChange={(raw) => { name = raw; }}
        onCreateRequest={(rawName) => { request = { action: 'Create', rawName }; }}
        {onRevokeRequest}
      />
      {#if request}
        <p role="status" class="mt-4 text-sm text-gray-300 break-words">Preview request only (not applied): {JSON.stringify(request)}</p>
      {/if}
    </div>
  </div>
</main>
