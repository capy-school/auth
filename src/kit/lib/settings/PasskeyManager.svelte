<script module lang="ts">
  export interface PasskeyRow {
    id: string;
    name?: string | null;
    createdAtLabel?: string;
  }

  export interface PasskeyManagerProps {
    passkeys: readonly PasskeyRow[];
    name: string;
    loading: boolean;
    error: string | null;
    editingId: string | null;
    editName: string;
    onNameChange: (raw: string) => void;
    onAdd: (rawName: string) => void;
    onStartEdit: (id: string) => void;
    onEditNameChange: (raw: string) => void;
    onSaveEdit: (id: string, rawName: string) => void;
    onCancelEdit: () => void;
    onDelete: (id: string) => void;
  }
</script>

<script lang="ts">
  let {
    passkeys, name, loading, error, editingId, editName,
    onNameChange, onAdd, onStartEdit, onEditNameChange, onSaveEdit, onCancelEdit, onDelete,
  }: PasskeyManagerProps = $props();
  const focusEditor = (node: HTMLInputElement) => { node.focus(); };
</script>

<div class="space-y-4">
  <div>
    <h2 class="text-xl font-semibold text-white">Passkeys</h2>
    <p class="text-sm text-gray-400">Register a passkey to enable passwordless sign-in.</p>
  </div>

  <div class="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
    <div class="flex gap-2 items-center">
      <input
        value={name}
        oninput={(event) => onNameChange(event.currentTarget.value)}
        aria-label="Device name"
        class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="Device name (optional)"
      />
      <button
        type="button" onclick={() => onAdd(name)} disabled={loading}
        class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
      >
        {loading ? 'Processing...' : 'Add Passkey'}
      </button>
    </div>
  </div>

  {#if error}
    <div class="text-sm text-red-400">{error}</div>
  {/if}

  <div class="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
    {#if loading && passkeys.length === 0}
      <div class="text-gray-400 text-sm">Loading...</div>
    {:else if passkeys.length === 0}
      <div class="text-gray-400 text-sm">No passkeys yet.</div>
    {:else}
      <ul class="space-y-2">
        {#each passkeys as passkey (passkey.id)}
          <li class="bg-gray-700/40 rounded-lg px-3 py-2">
            {#if editingId === passkey.id}
              <div class="flex items-center gap-2">
                <input
                  value={editName}
                  oninput={(event) => onEditNameChange(event.currentTarget.value)}
                  use:focusEditor
                  aria-label="Passkey name"
                  class="flex-1 min-w-0 px-2 py-1 rounded bg-gray-600 border border-gray-500 text-sm text-white"
                  placeholder="Passkey name"
                />
                <button
                  type="button" onclick={() => onSaveEdit(passkey.id, editName)} disabled={loading}
                  class="px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-xs"
                >Save</button>
                <button
                  type="button" onclick={onCancelEdit} disabled={loading}
                  class="px-2 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white text-xs"
                >Cancel</button>
              </div>
            {:else}
              <div class="flex items-center justify-between">
                <div class="text-sm text-gray-200 flex-1 min-w-0 wrap-break-word">
                  <div class="font-medium">{passkey.name || 'Unnamed passkey'}</div>
                  {#if passkey.createdAtLabel}
                    <div class="text-gray-400 text-xs">Created {passkey.createdAtLabel}</div>
                  {/if}
                </div>
                <div class="flex gap-2">
                  <button
                    type="button" onclick={() => onStartEdit(passkey.id)} disabled={loading}
                    class="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  >Rename</button>
                  <button
                    type="button" onclick={() => onDelete(passkey.id)} disabled={loading}
                    class="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs"
                  >Delete</button>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
