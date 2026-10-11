<script module lang="ts">
  export type OAuthProvider = 'google' | 'github' | 'microsoft' | 'kakao' | 'naver' | 'line';
</script>

<script lang="ts">
  import AuthButton from './AuthButton.svelte';

  interface Props {
    errors?: readonly string[];
    onProvider?: (provider: OAuthProvider) => void;
  }
  let { errors = [], onProvider }: Props = $props();
  const providers: { id: OAuthProvider; label: string }[] = [
    { id: 'google', label: 'Google' },
    { id: 'github', label: 'GitHub' },
    { id: 'microsoft', label: 'Microsoft' },
    { id: 'kakao', label: 'Kakao' },
    { id: 'naver', label: 'Naver' },
    { id: 'line', label: 'Line' },
  ];
</script>

<div class="space-y-2.5">
  <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">OAuth Providers</h2>
  <div class="grid grid-cols-2 gap-2">
    {#each providers as provider (provider.id)}
      <AuthButton
        provider={provider.id}
        disabled={errors.length > 0 || !onProvider}
        onclick={() => onProvider?.(provider.id)}
      >
        {#snippet icon()}
          <svg viewBox="0 0 24 24" class="w-full h-full" fill="currentColor">
            {#if provider.id === 'google'}
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            {:else if provider.id === 'github'}
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.1.8-.26.8-.58v-2.23c-3.34.72-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.72.08-.72 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.53-1.52.12-3.17 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4s2.04.13 3 .4c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.38.82 1.1.82 2.22v3.29c0 .32.2.69.81.58C20.56 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
            {:else if provider.id === 'microsoft'}
              <path fill="#f25022" d="M1 1h10v10H1z" />
              <path fill="#00a4ef" d="M13 1h10v10H13z" />
              <path fill="#7fba00" d="M1 13h10v10H1z" />
              <path fill="#ffb900" d="M13 13h10v10H13z" />
            {:else if provider.id === 'kakao'}
              <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="14" font-weight="bold">kakao</text>
            {:else if provider.id === 'naver'}
              <circle cx="12" cy="12" r="10" />
            {:else}
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975 C23.176 14.393 24 12.458 24 10.314" />
            {/if}
          </svg>
        {/snippet}
        {provider.label}
      </AuthButton>
    {/each}
  </div>
</div>
