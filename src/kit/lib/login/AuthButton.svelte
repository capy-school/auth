<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { OAuthProvider } from './OAuthProviders.svelte';

  interface Props {
    provider: OAuthProvider;
    onclick?: () => void;
    disabled?: boolean;
    icon?: Snippet;
    children: Snippet;
  }
  let { provider, onclick, disabled = false, icon, children }: Props = $props();
  const providerStyles: Record<OAuthProvider, string> = {
    google: 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white',
    github: 'bg-gradient-to-br from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white',
    microsoft: 'bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white',
    kakao: 'bg-gradient-to-br from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900',
    naver: 'bg-gradient-to-br from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white',
    line: 'bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white',
  };
</script>

<button
  type="button"
  disabled={disabled || !onclick}
  onclick={() => { if (!disabled) onclick?.(); }}
  class="w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg {providerStyles[provider]} {disabled || !onclick ? 'opacity-50 pointer-events-none' : ''}"
>
  {#if icon}
    <span aria-hidden="true" class="auth-icon w-4 h-4 shrink-0">{@render icon()}</span>
  {/if}
  {@render children()}
</button>
