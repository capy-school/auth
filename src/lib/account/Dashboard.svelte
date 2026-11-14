<script lang="ts">
  import AccountShell from './AccountShell.svelte';
  import Sessions from './Sessions.svelte';
  import Icon from './Icon.svelte';
  const settings = [
    { href: '/settings/passkey', icon: 'key', title: 'Passkeys', description: 'Entra con tu dispositivo, sin contraseña.' },
    { href: '/settings/2fa', icon: 'shield', title: 'Autenticación en dos pasos', description: 'Consulta y configura una segunda comprobación.' },
    { href: '/settings/api-keys', icon: 'code', title: 'Claves de API', description: 'Administra el acceso desde tus aplicaciones.' },
    { href: '/settings/organizations', icon: 'building', title: 'Organizaciones', description: 'Gestiona tus equipos y espacios compartidos.' },
  ] as const;
</script>

<AccountShell active="overview" title="Cuenta y seguridad" description="Tu información personal y las opciones para proteger tu acceso.">
  {#snippet children(user)}
    {@const name = user ? user.name?.trim() || user.email || 'Mi cuenta' : ''}
    {@const initials = name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('').toLocaleUpperCase('es')}
    <section class="dashboard-profile" aria-label="Información de perfil">
      <div class="dashboard-avatar" aria-hidden="true"><span>{initials}</span>{#if user?.image}<img src={user.image} alt="" width="48" height="48" referrerpolicy="no-referrer" />{/if}</div>
      <div class="dashboard-profile-name"><h2>{name}</h2><p>{user?.email || ''}</p></div>
      <div class="dashboard-badges">{#if user}<span class="dashboard-badge">{user.role || 'user'}</span>{#if user.emailVerified}<span class="dashboard-badge is-verified">✓ Correo verificado</span>{/if}{/if}</div>
    </section>
    <div class="dashboard-columns">
      <div class="dashboard-settings">
        <section aria-labelledby="security-heading">
          <h2 class="dashboard-section-title" id="security-heading">Gestiona tu acceso</h2>
          <p class="dashboard-section-description">Opciones de tu cuenta, en un solo lugar.</p>
          <div class="dashboard-settings-list">
            {#each settings as setting}<a class="dashboard-setting" href={setting.href}><span class="dashboard-setting-icon"><Icon name={setting.icon} /></span><span class="dashboard-setting-copy"><strong>{setting.title}</strong><span>{setting.description}</span></span><Icon name="arrow" class="dashboard-arrow" /></a>{/each}
          </div>
        </section>
        {#if user?.role === 'admin'}<section class="dashboard-admin" aria-label="Administración"><a class="account-text-link" href="/api/auth/reference">Documentación de la API <Icon name="arrow" /></a></section>{/if}
      </div>
      <Sessions summary authorized={!!user} />
    </div>
  {/snippet}
</AccountShell>
