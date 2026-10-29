# Account Pages A Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. The user approved the written spec and explicitly chose active sessions. Preserve the current feature branch and its uncommitted A implementation; do not create a checkout missing those files. Do not stage, commit, push, migrate a database, or change Go/Rust.

**Goal:** Ship real account navigation, coherent A settings and an active-sessions replacement for notes.

**Architecture:** A reusable Astro account shell wraps the existing light document. Thin authenticated routes delegate to presentation components. Small native DOM controllers call the existing typed Better Auth client; each feature owns its state and renders untrusted strings as text. Existing React implementations stay untouched but are no longer used by these account routes, avoiding changes to other consumers.

**Tech Stack:** Astro 5, TypeScript, native DOM, existing Better Auth 1.3.34, Node tests, isolated Vite/Astro Container and Chrome CDP. No dependencies added. Context7 is unavailable in the tool catalog; use official Astro docs and the installed Better Auth implementation/types.

## File boundaries

| Files | Responsibility |
| --- | --- |
| `src/components/account/AccountShell.astro` | Four route links, active state, identity, breadcrumb, logout and content slot |
| `src/components/account/AccountPage.astro` | Settings presentation selection and titles |
| `src/components/account/{Feedback,Sessions,Passkeys,ApiKeys,TwoFactor,Organizations}.astro` | Semantic markup, forms and single native initializer per feature |
| `src/components/account/{ui,sessions,passkeys,api-keys,two-factor,organizations}.ts` | Safe DOM helpers and feature operations through the existing auth client |
| `src/components/dashboard/Dashboard.astro` | Retain approved profile/settings hierarchy; use shell and sessions summary |
| `src/styles/dashboard.css` | Shared controls, lists, forms and responsive account surface |
| `src/pages/settings/{security,sessions,passkey,2fa,api-keys,organizations}.astro` | Strict session guard and presentation props; local passkey availability comes from existing `localAuthPolicy` |
| `tests/helpers/dashboard-fixture.mjs` | Render real dashboard/settings, fixture-only auth-client replacement and route guard testing |
| `tests/{dashboard,account-pages,account-browser,account-auth}.test.*` | Presentation, routes, browser interactions and real isolated server contracts |

## Unit 1: Shell, routes and removed notes

- [x] Add failing SSR checks for four non-anchor navigation destinations, accurate `aria-current`, consistent A shell across six settings pages, absent notes and preserved profile escaping.

```js
const html = await fixture.render();
assert.ok(html.includes('href="/settings/security"'));
assert.ok(html.includes('href="/settings/sessions"'));
assert.doesNotMatch(html, /data-notes|href="#account-security"/);
```

- [x] Run `node --test tests/dashboard.test.mjs tests/account-pages.test.mjs`, observe behavioral RED before production edits.
- [x] Extract the approved sidebar/topbar to `AccountShell.astro`, implement `AccountPage.astro` and add the two new routes. Every settings route uses:

```astro
const session = await auth.api.getSession({ headers: Astro.request.headers });
if (!session?.user) return Astro.redirect('/');
```

- [x] Preserve the dashboard's executable auth guard, use real settings links and remove notes initialization without touching `secure_notes_data`. Do not link to a nonexistent admin page. Keep the API reference conditional on admin role and server availability.
- [x] Make SSR/route tests GREEN and retain legacy notes storage tests.

## Unit 2: Active sessions

- [x] Write browser failures for summary/list loading, current-session identification, revocation confirmation, error/retry, empty responses and tokens absent from DOM/local storage.
- [x] Implement `Sessions.astro` with summary and full variants and `sessions.ts` using `getSession()`, `listSessions()` and `revokeSession({ token })`. Keep tokens in closures only. Never offer revocation of the current session; use the existing logout link.
- [x] Add real isolated server contract tests based on `createLocalAuth(..., true)`: magic-link login, list two sessions, revoke the other, reject revocation belonging to a second user. All databases/inboxes live in an owned temporary directory.
- [x] Run `node --import tsx --test tests/account-auth.test.ts` and browser tests GREEN.

## Unit 3: Supported settings operations

- [x] Add browser failures for passkey availability, add/rename/delete, API-key create/revoke/copy feedback, and literal hostile key names.
- [x] Implement feature forms/controllers. Generated API-key secrets remain transient and can be dismissed explicitly; failed clipboard writes retain the secret and explain how to copy manually.
- [x] Add browser failures for server-confirmed 2FA state, password confirmation, TOTP verification, disable failures and no simulated activation.
- [x] Replace the route's simulated flow with Better Auth `twoFactor.enable`, `verifyTotp` and `disable`. List credential providers via `listAccounts()` before offering setup; explain unavailable setup for passwordless accounts. Secrets and backup codes are server-generated and never persisted in browser storage. A QR-generation failure must still leave the returned manual TOTP key usable.
- [x] Run the relevant browser cases GREEN. Do not enable password sign-in or the missing local passkey plugin.

## Unit 4: Organizations and shared interaction states

- [x] Add browser failures for create/select, members/invitations, membership removal and invitation cancellation, including API failures.
- [x] Implement the existing operations in `Organizations.astro`/`organizations.ts`; explicitly pass the selected organization ID to scoped APIs, clear stale details before loading a different organization and avoid showing another organization's delayed response.
- [x] Complete shared styles for pending, error, success, disabled, focus and editable boundaries. Keep live regions exposed before messages. Support long text and all four mobile destinations.
- [x] Run browser cases GREEN at 1440, 390 and 320 pixels; preserve raw notes storage on navigation.

## Unit 5: Regression and delivery

- [x] Adapt obsolete notes UI tests to the approved replacement; do not erase storage compatibility tests or claim obsolete notes interactions remain visible.
- [x] Run new tests, the existing local/config and Svelte presentation suites, strict TypeScript on the new controllers and `git diff --check`.
- [x] Verify anonymous `auth.localhost` redirects for every account route without using a real signed-in browser or writing its database. Review actual screenshots and navigation.
- [x] Request an independent read-only review after implementation; reproduce and fix actionable findings with tests before delivery.
- [x] Inspect final status and explicitly preserve pre-existing staged Go/docs/odd work. Update this record with exact evidence, limitations and files. Delivery is a working-tree change, not a commit or deployment.

## Acceptance and rollback

The approved spec is `docs/superpowers/specs/2026-10-27-account-pages-design.md`. Remove the new account components/controllers, restore only the owned dashboard/settings presentation and styles, and remove their tests/docs to roll back. Authentication factories, database schema, shared login layout, Go/Rust and the static candidate stay outside this work unit.

## Verification record

```bash
node --import tsx --test --test-concurrency=1 \
  tests/dashboard-notes.test.ts tests/dashboard.test.mjs \
  tests/account-pages.test.mjs tests/account-browser.test.mjs \
  tests/account-auth.test.ts tests/dashboard-browser.test.mjs \
  tests/local-auth.test.mjs tests/local-integration.test.ts \
  tests/local-config.test.mjs tests/kit-config.test.mjs \
  tests/kit-login.test.mjs tests/kit-passkeys.test.mjs \
  tests/kit-api-key-dialog.test.mjs tests/kit-api-keys.test.mjs

node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
  --allowJs --types astro/client,node --target ES2022 --module ESNext \
  --moduleResolution Bundler --lib ES2022,DOM src/components/account/*.ts

git diff --check
```

Final aggregate: **115 passed, 0 failed, 0 skipped**. Breakdown: 18 SSR/route tests, 19 feature-browser cases, 5 responsive/accessibility/storage browser cases, 6 real server contracts, 5 retained legacy-storage tests and 62 existing local/config/static-candidate regressions. Strict controller TypeScript and whitespace checks passed. Full test output is also saved at `/tmp/opencode/auth-account-tests.log`.

The six real contracts use owned temporary databases and fictional accounts: session ownership/revocation; annual key expiry and key lifecycle; organization membership/invitations; explicit organization scope for member removal; the installed passkey deletion response; and real server TOTP with invalid password/code rejection, activation and deactivation. TOTP tests seed a credential only in their temporary database. The passkey contract enables the existing plugin only in an extra temporary test instance and seeds a credential to test deletion; it is not a hardware WebAuthn registration test.

Browser tests render the real Astro components and their native client scripts, with a fixture-only auth transport for repeatable UI states. They are not an authenticated end-to-end run against the user's real account. Screenshots cover all seven account views at 1440 and 390 pixels under `/tmp/opencode/auth-account-<page>-<width>.png`; layout, navigation and labels are also checked at 320 pixels. Desktop dashboard/organizations and mobile key/2FA screens were visually reviewed. No full production build, deployment, physical authenticator or screen-reader speech certification is claimed.

Anonymous requests to the real `auth.localhost` dashboard and all six settings destinations returned **302 to `/`**. The dashboard's executable authentication/user-selection block compares byte-for-byte identical to HEAD. Auth factories/client, shared login layout/global stylesheet, package/config, Go/Rust and Kit sources are unchanged; all 16 Go-reference hashes still match. The pre-existing staged Go/docs/odd entries remain exactly outside this work.

## Review corrections

Independent read-only review identified one P1, two P2s and an optional focus issue. Each was reproduced before its correction:

- API-key creation again sends the previous one-year `expiresIn`, rather than silently creating permanent keys. Real server tests verify both annual expiry and the unsafe omitted-parameter default.
- Better Auth 1.3's successful passkey registration returns `undefined`; deletion returns HTTP 200 with JSON `null`, despite object-shaped metadata. Registration and deletion handle their actual success contracts while queries still require data.
- Session revocation focuses the exposed, now programmatically focusable status region after the button is removed.
- Pending TOTP verification cannot clear recovery codes through Cancel. A scoped re-review additionally identified the ambiguous-transport case: an inactive read does not prove the earlier request has stopped. The final regression reproduces an interim inactive read, an inactive retry and a later server commit. Unknown outcomes retain codes and lock Cancel/Verify until activation is positively confirmed; definitive known server rejections remain retryable. Users are instructed to save recovery codes before leaving an unresolved state.

Initial review and one scoped re-review were performed. The final transport/late-commit refinement was validated with the new parent-run regression and strict compiler, not a third independent review. No reviewer modified code.

Delivery remains on `feat/sveltekit-auth` in the working tree, including the previously uncommitted A dashboard. No stage/commit/push/merge/deploy or production database change was performed.
