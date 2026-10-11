<script lang="ts">
  import type { Snippet } from 'svelte';
  import AuthButton from './AuthButton.svelte';

  interface Props {
    email: string;
    showEmailInput: boolean;
    errors?: readonly string[];
    showOTP?: boolean;
    beforeEmail?: Snippet;
    onRevealEmail?: () => void;
    onEmailChange?: (value: string) => void;
    onMagicLink?: (email: string) => void;
    onEmailOTP?: (email: string) => void;
  }
  let {
    email, showEmailInput, errors = [], showOTP = true, beforeEmail,
    onRevealEmail, onEmailChange, onMagicLink, onEmailOTP,
  }: Props = $props();
</script>

<div class="space-y-2.5 mb-5">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Passwordless</h2>
  </div>
  {@render beforeEmail?.()}

  {#if !showEmailInput}
    <AuthButton provider="email" disabled={errors.length > 0} onclick={onRevealEmail}>
      {#snippet icon()}
        <svg viewBox="0 0 24 24" class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
          <rect x="2" y="4" width="20" height="16" rx="2" />
        </svg>
      {/snippet}
      Sign in with Email
    </AuthButton>
  {:else}
    <div class="space-y-2.5">
      <input
        type="email"
        aria-label="Email address"
        placeholder="Enter your email"
        value={email}
        oninput={(event) => onEmailChange?.(event.currentTarget.value)}
        autocomplete="email webauthn"
        class="w-full px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={errors.length > 0 || !onMagicLink}
          onclick={() => { if (email && errors.length === 0) onMagicLink?.(email); }}
          class="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 {errors.length || !onMagicLink ? 'opacity-50 cursor-not-allowed' : ''}"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
            <path d="m21 2-9.6 9.6" />
            <circle cx="7.5" cy="15.5" r="5.5" />
          </svg>
          Magic Link
        </button>
        {#if showOTP}
          <button
            type="button"
            disabled={errors.length > 0 || !onEmailOTP}
            onclick={() => { if (email && errors.length === 0) onEmailOTP?.(email); }}
            class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 {errors.length || !onEmailOTP ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
              <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
            </svg>
            Email OTP
          </button>
        {/if}
      </div>
      {#if showOTP}
        <p class="text-xs text-gray-400">Email OTP feature - Configure email service and Better Auth plugin</p>
      {/if}
    </div>
  {/if}
</div>
