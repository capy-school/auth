<script lang="ts">
  import Feedback from './Feedback.svelte';
  import { manager } from './manager';
  let { summary = false, authorized = false }: { summary?: boolean; authorized?: boolean } = $props();
</script>

<section class="account-manager" class:account-session-summary={summary} data-manager="sessions" data-kit-manager data-summary={String(summary)} aria-label="Sesiones activas" use:manager={{ name: 'sessions', authorized }}>
  {#if summary}<header class="account-panel-heading"><h2>Sesiones activas</h2><p>Revisa desde dónde tienes acceso a tu cuenta.</p></header>{/if}
  <Feedback />
  <p class="account-empty" data-empty hidden>No hay sesiones vigentes para mostrar.</p>
  <ul class="account-list" data-list></ul>
  {#if summary}<a class="account-text-link" href="/settings/sessions">Gestionar sesiones <span aria-hidden="true">→</span></a>{:else}<p class="account-hint">Si no reconoces una sesión, ciérrala. Para salir de este dispositivo, utiliza Cerrar sesión en la cabecera.</p>{/if}
</section>
