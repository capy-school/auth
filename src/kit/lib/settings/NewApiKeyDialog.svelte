<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    open: boolean;
    keyValue: string;
    copyLabel: 'Copy' | 'Copied!';
    onCopy: () => void;
    onClose: () => void;
    notice?: Snippet;
  };
  let { open, keyValue, copyLabel, onCopy, onClose, notice }: Props = $props();
</script>

<div id="newKeyModal" class:hidden={!open} class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full p-6">
    <div class="flex items-start gap-3 mb-4">
      <div class="p-2 bg-green-500/20 rounded-lg">
        <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
      <div class="flex-1">
        <h3 class="text-xl font-semibold text-white mb-1">API Key Generated</h3>
        <p class="text-gray-400 text-sm">Save this key securely. You won't be able to see it again.</p>
      </div>
    </div>
    {@render notice?.()}
    <div class="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-4">
      <div class="flex items-center justify-between gap-3 mb-2">
        <span class="text-xs font-medium text-gray-400 uppercase">API Key</span>
        <button id="copyKeyBtn" type="button" onclick={() => onCopy()} class="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">
          {copyLabel}
        </button>
      </div>
      <code id="newKeyValue" class="block text-sm font-mono text-green-400 break-all">{keyValue}</code>
    </div>
    <button id="closeModalBtn" type="button" onclick={() => onClose()} class="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
      I've saved my key
    </button>
  </div>
</div>
