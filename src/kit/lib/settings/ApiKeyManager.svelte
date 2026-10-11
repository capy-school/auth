<script module lang="ts">
  export interface ApiKeyRow {
    id: string;
    name?: string | null;
    createdAtLabel: string;
    expired: boolean;
  }

  export interface ApiKeyManagerProps {
    rows: readonly ApiKeyRow[];
    listState: 'loading' | 'ready' | 'hidden';
    name: string;
    onNameChange: (rawName: string) => void;
    onCreateRequest: (rawName: string) => void;
    onRevokeRequest: (id: string) => void;
  }
</script>

<script lang="ts">
  let {
    rows, listState, name, onNameChange, onCreateRequest, onRevokeRequest,
  }: ApiKeyManagerProps = $props();

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreateRequest(name);
  };
</script>

<div class="bg-gray-800/50 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-gray-700">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-white mb-2">API Keys</h1>
    <p class="text-gray-400">Manage your application API keys for programmatic access</p>
  </div>

  <div class="bg-gradient-to-br from-yellow-900/20 to-orange-900/20 border border-yellow-700/50 rounded-lg p-4 mb-6">
    <div class="flex gap-3">
      <svg class="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
      <div>
        <h3 class="text-yellow-300 font-semibold mb-1">Security Notice</h3>
        <p class="text-yellow-200/80 text-sm">API keys provide full access to your account. Keep them secure and never share them publicly.</p>
      </div>
    </div>
  </div>

  <form id="apiKeyForm" class="mb-6" onsubmit={onSubmit}>
    <div class="flex flex-col sm:flex-row gap-3">
      <input
        id="keyName"
        type="text"
        placeholder="Key name (e.g., Production API)"
        required
        value={name}
        oninput={(event) => onNameChange(event.currentTarget.value)}
        class="flex-1 px-4 py-2.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all min-w-0"
      />
      <button
        type="submit"
        class="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        <span>Generate Key</span>
      </button>
    </div>
  </form>

  {#if listState === 'loading'}
    <div id="apiKeysLoading" class="text-center py-12 text-gray-400">
      <div class="animate-pulse">
        <div class="text-4xl mb-3">⏳</div>
        <p class="text-sm">Loading API keys...</p>
      </div>
    </div>
  {:else if listState === 'ready'}
    {#if rows.length === 0}
      <div id="apiKeysEmpty" class="text-center py-12 text-gray-400 border border-gray-700 rounded-lg">
        <div class="text-6xl mb-3">🔑</div>
        <p class="text-sm font-medium mb-1">No API Keys</p>
        <p class="text-xs text-gray-500">Generate your first API key to get started</p>
      </div>
    {:else}
      <div id="apiKeysList" class="space-y-3">
        {#each rows as row (row.id)}
          <div class="group bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/50 rounded-lg p-4 transition-all" data-key-id={row.id}>
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="flex-1 min-w-0 basis-44">
                <div class="flex items-center gap-3 mb-2">
                  <div class="text-xl">🔑</div>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-white truncate">{row.name || 'Unnamed Key'}</h3>
                    <p class="text-xs text-gray-400">Created {row.createdAtLabel}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  <code class="text-sm font-mono text-gray-300 bg-gray-900/50 px-3 py-1.5 rounded border border-gray-700/50 shrink-0">••••••••••••••••</code>
                  <span class="px-2 py-1 {row.expired ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'} text-xs rounded border">{row.expired ? 'Expired' : 'Active'}</span>
                </div>
              </div>
              <button
                type="button" onclick={() => onRevokeRequest(row.id)}
                class="delete-btn shrink-0 p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                title="Revoke key"
              >
                🗑️
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
