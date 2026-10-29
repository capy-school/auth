# Implement the approved immersive login

The user approved implementation with “implementa” after comparing A/B, restoring provider colors and correcting contrast. The selected design is A, not the older low-contrast iteration.

## Delivery boundary

- Keep A's asymmetric desktop composition, architectural aperture, blue/violet/mint atmosphere, Spanish copy and compact mobile form.
- Keep Google blue, GitHub dark grey, Microsoft grey with its multicolor mark, Kakao yellow and Naver/LINE green. Carry over the corrected text, border, hover and focus contrasts.
- Reuse the real React authentication controller. Preserve callback URLs, app/origin validation, stored app handoff, session redirect and conditional passkey autofill. Do not import prototype scripts or simulated feedback.
- Show email entry immediately, with a visible label and native email validation. Submit to the existing magic-link handler. Keep the existing local inbox link and local-mode exclusions for passkey/OAuth.
- Keep SSR inputs/sign-in buttons disabled until hydration and query validation are ready. Use POST as defense against native GET exposure of the email, and provide no-JavaScript guidance. This is a presentation guard, not a new authentication endpoint.
- Email OTP is not configured: show it disabled in the non-local presentation, never pretend to send a code. Do not add a backend feature.
- Preserve app identity/destination and visible invalid-query feedback. Invalid app parameters must disable all sign-in methods through native controls, including keyboard access.

## Structure

| Boundary | Responsibility |
| --- | --- |
| Astro login portal | Static brand, story, decorative SVG and layout slot |
| Existing React gateway | Real form, method availability, app context, existing handlers and effects |
| Login stylesheet | Scoped `.login-page` surface, provider tones, responsive layout and reduced motion |
| Existing layout | Optional document language, default unchanged for other pages |

No comparison bar, preview notice, A/B keys, external resources, invented security promises or additional authentication methods ship. No new dependencies, database changes, dashboard/settings changes, staging, commits or deployment are authorized. Keep the current feature checkout and its existing uncommitted work.

## Acceptance

1. Real home page renders A, including usable email entry, without preview controls.
2. Real gateway handlers receive the same provider IDs and callback targets. Existing app validation, storage-denied fallback and session redirects work.
3. Local mode keeps its current real-method availability. OTP remains unavailable.
4. At 1440, 390 and 320px, labels fit, controls are reachable and focus is visible. The reviewed text and control boundaries meet 4.5:1 and 3:1 respectively, including hover/focus/pressed states.
5. The prior 115-test baseline remains green. New SSR and browser regressions run with an isolated fixture, not a real account.
