<script lang="ts">
  import '../../../../styles/global.css';
  import NewApiKeyDialog from '$lib/settings/NewApiKeyDialog.svelte';

  const fictionalValue = 'FICTIONAL-NOT-A-KEY-ONLY-A-DIALOG-FIXTURE-NOT-VALID-FOR-AUTHENTICATION-NOT-ACCOUNT-DATA-NOT-A-RETURNED-SECRET-LONG-TEXT-FOR-WRAPPING-ONLY';
  let open = $state(true);
  let copyRequests = $state(0);
  let dismissals = $state(0);
</script>

<svelte:head>
  <title>Fictional API-key dialog preview</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="min-h-screen text-gray-100 antialiased animated-gradient">
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-2xl mx-auto">
      <div class="bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-gray-700 space-y-3">
        <h1 class="text-xl font-semibold text-white">API-key dialog presentation preview only</h1>
        <p class="text-sm text-gray-300">No account management is connected. Reopen redisplays the same fictional fixture; it creates or recovers nothing. Reload resets this preview.</p>
        <button
          type="button"
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          onclick={() => { open = true; }}
        >Reopen fictional dialog (preview only)</button>
        {#if copyRequests || dismissals}
          <p role="status" class="text-sm text-gray-300">
            Preview diagnostics only — copy requests: {copyRequests}; dismissals: {dismissals}. Nothing was copied or generated.
          </p>
        {/if}
      </div>
      <NewApiKeyDialog
        {open}
        keyValue={fictionalValue}
        copyLabel="Copy"
        onCopy={() => { copyRequests++; }}
        onClose={() => { dismissals++; open = false; }}
      >
        {#snippet notice()}
          <p class="mb-4 text-sm text-gray-300">Fictional dialog fixture — no API key was generated. Copy records a request only; nothing is copied.</p>
        {/snippet}
      </NewApiKeyDialog>
    </div>
  </div>
</main>
