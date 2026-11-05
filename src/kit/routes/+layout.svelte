<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../../styles/global.css';

  let { children }: { children: Snippet } = $props();
</script>

<div lang="es" style="display: contents">{@render children()}</div>
