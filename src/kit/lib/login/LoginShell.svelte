<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    errors?: readonly string[];
    appSummary?: { name: string; description?: string; destination?: string };
    children?: Snippet;
  }
  let { errors = [], appSummary, children }: Props = $props();
</script>

<div class="min-h-screen flex items-center justify-center p-3">
  <div class="w-full max-w-lg bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-gray-700">
    {#if errors.length > 0}
      <div role="alert" class="mb-4 text-left text-xs text-red-400 bg-red-950/30 border border-red-700/40 rounded-md p-2">
        <p class="font-semibold mb-1">Unable to proceed:</p>
        <ul class="list-disc pl-5 space-y-0.5">
          {#each errors as error}
            <li>{error}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold text-white mb-1">Welcome Back</h1>
      <p class="text-sm text-gray-400">Sign in to your account using your preferred method</p>
      {#if appSummary && errors.length === 0}
        <div class="mt-2">
          <p class="text-xs text-gray-300">Sign in to <span class="font-semibold">{appSummary.name}</span></p>
          {#if appSummary.description}
            <p class="text-[11px] text-gray-400">{appSummary.description}</p>
          {/if}
          {#if appSummary.destination}
            <p class="text-[11px] text-gray-500">Destination: {appSummary.destination}</p>
          {/if}
        </div>
      {/if}
    </div>

    {@render children?.()}
  </div>
</div>
