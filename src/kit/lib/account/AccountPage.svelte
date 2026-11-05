<script lang="ts">
  import AccountShell from './AccountShell.svelte';
  import Sessions from './Sessions.svelte';
  import Passkeys from './Passkeys.svelte';
  import ApiKeys from './ApiKeys.svelte';
  import TwoFactor from './TwoFactor.svelte';
  import Organizations from './Organizations.svelte';

  let { page }: { page: 'security' | 'sessions' | 'passkey' | 'two-factor' | 'api-keys' | 'organizations' } = $props();
  const titles = { security: 'Seguridad', sessions: 'Sesiones activas', passkey: 'Passkeys', 'two-factor': 'Autenticación en dos pasos', 'api-keys': 'Claves de API', organizations: 'Organizaciones' };
  const descriptions = { security: 'Elige cómo acceder y proteger tu cuenta.', sessions: 'Consulta tus accesos y cierra los que no reconozcas.', passkey: 'Gestiona las credenciales de tus dispositivos.', 'two-factor': 'Una comprobación adicional, verificada por el servidor.', 'api-keys': 'Controla el acceso de tus aplicaciones.', organizations: 'Gestiona tus espacios compartidos, miembros e invitaciones.' };
  const active = $derived(page === 'sessions' || page === 'organizations' ? page : 'security');
  const methods = [
    ['/settings/passkey', 'Passkeys', 'Dispositivos y acceso sin contraseña.'],
    ['/settings/2fa', 'Autenticación en dos pasos', 'Estado y configuración de tu segundo factor.'],
    ['/settings/api-keys', 'Claves de API', 'Acceso para tus aplicaciones.'],
    ['/settings/sessions', 'Sesiones activas', 'Dispositivos con una sesión vigente.'],
  ];
</script>

<AccountShell {active} title={titles[page]} description={descriptions[page]}>
  {#snippet children(user)}
    <div class="account-page-content">
      {#if page === 'security'}
        <section class="account-security" aria-label="Métodos de acceso"><p class="account-notice">{user ? user.emailVerified ? 'Tu correo está verificado.' : 'Tu correo no figura como verificado.' : ''} El estado de cada método se consulta en sus ajustes.</p><div class="dashboard-settings-list">{#each methods as [href, title, description]}<a class="dashboard-setting" {href}><span class="dashboard-setting-copy"><strong>{title}</strong><span>{description}</span></span><span aria-hidden="true">→</span></a>{/each}</div></section>
      {:else if page === 'sessions'}<Sessions authorized={!!user} />
      {:else if page === 'passkey'}<Passkeys authorized={!!user} />
      {:else if page === 'api-keys'}<ApiKeys authorized={!!user} />
      {:else if page === 'two-factor'}<TwoFactor authorized={!!user} />
      {:else if page === 'organizations'}<Organizations authorized={!!user} />{/if}
    </div>
  {/snippet}
</AccountShell>
