<svelte:head>
  <title>SvelteKit migration diagnostic</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <h1>SvelteKit migration diagnostic</h1>
  <p>This is an incomplete, non-default candidate. Astro remains the default application.</p>
  <p>No authentication or database access is implemented here. Do not deploy this candidate.</p>
  <p>HTML is generated at build time; there is no request-time renderer.</p>
  <p><a href="/__migration/build.json" data-sveltekit-reload>Static build JSON (not service health)</a></p>
</main>

<style>
  main {
    max-width: 48rem;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
  }
</style>
