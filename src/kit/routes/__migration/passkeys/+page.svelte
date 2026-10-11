<script lang="ts">
  import '../../../../styles/global.css';
  import PasskeyManager, { type PasskeyRow } from '$lib/settings/PasskeyManager.svelte';

  type Fixture = 'empty' | 'populated' | 'loading' | 'error' | 'loading-rows';
  type PreviewRequest = { action: 'Add' | 'Save' | 'Delete'; id?: string; rawName?: string };
  const fictionalRows: readonly PasskeyRow[] = [
    { id: 'fictional-laptop', name: 'Fictional laptop', createdAtLabel: 'Example date — not account data' },
    { id: 'fictional-unnamed', name: null },
  ];
  let fixture = $state<Fixture>('empty');
  let name = $state('My device');
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let request = $state<PreviewRequest | null>(null);
  const passkeys = $derived(fixture === 'populated' || fixture === 'error' || fixture === 'loading-rows'
    ? fictionalRows : []);
  const loading = $derived(fixture === 'loading' || fixture === 'loading-rows');
  const error = $derived(fixture === 'error' ? 'Fictional preview error — no account request was made.' : null);
  const onCancelEdit = () => { editingId = null; editName = ''; };
  const onStartEdit = (id: string) => {
    editingId = id;
    editName = passkeys.find(row => row.id === id)?.name || '';
  };
</script>

<svelte:head>
  <title>Passkey management preview</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen text-gray-100 antialiased animated-gradient">
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-2xl mx-auto">
      <div class="mb-6 space-y-3">
        <p class="text-sm text-gray-300">Passkey management preview only — account management is not connected.</p>
        <p class="text-sm text-gray-400">Fictional data; requests are recorded only, never applied. Reload resets this preview.</p>
        <label class="block text-sm text-gray-300">
          Preview fixture
          <select
            class="mt-1 block rounded-lg bg-gray-700 border border-gray-600 px-3 py-2 text-white"
            value={fixture}
            onchange={(event) => {
              fixture = event.currentTarget.value as Fixture;
              onCancelEdit();
              request = null;
            }}
          >
            <option value="empty">Empty</option>
            <option value="populated">Populated</option>
            <option value="loading">Loading</option>
            <option value="error">Error</option>
            <option value="loading-rows">Loading with rows</option>
          </select>
        </label>
      </div>
      <div class="bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-gray-700">
        <PasskeyManager
          {passkeys} {name} {loading} {error} {editingId} {editName}
          onNameChange={(raw) => { name = raw; }}
          onAdd={(rawName) => { request = { action: 'Add', rawName }; }}
          {onStartEdit}
          onEditNameChange={(raw) => { editName = raw; }}
          onSaveEdit={(id, rawName) => { request = { action: 'Save', id, rawName }; }}
          {onCancelEdit}
          onDelete={(id) => { request = { action: 'Delete', id }; }}
        />
        {#if request}
          <p role="status" class="mt-4 text-sm text-gray-300 break-words">Preview request only (not applied): {JSON.stringify(request)}</p>
        {/if}
      </div>
    </div>
  </div>
</main>
