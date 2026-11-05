<script lang="ts">
  import type { Snippet } from 'svelte';
  import ProviderIcon, { type Provider } from './ProviderIcon.svelte';

  let { provider, disabled = true, onclick, children }: {
    provider: Provider;
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
  } = $props();
  const providerStyles: Record<Provider, string> = {
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
  data-provider={provider}
  disabled={disabled || !onclick}
  {onclick}
  class="w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg {providerStyles[provider]}"
>
  <span class="auth-icon w-4 h-4 shrink-0" aria-hidden="true"><ProviderIcon {provider} /></span>
  {@render children()}
</button>
