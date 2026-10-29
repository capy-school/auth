# Dashboard A Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. The user reviewed the two visual proposals, chose A, and explicitly requested implementation. Preserve unrelated staged/untracked Go work. No new design interview or worktree is needed.

**Goal:** Implement the approved light account dashboard with side navigation, a clear security-settings list and secondary browser-local notes.

**Architecture:** Keep the existing page's session lookup, anonymous redirect and local fixture condition unchanged. A dedicated Astro dashboard layout/component isolates its light theme from the existing login/settings layouts. A small notes module handles validation/storage; a DOM controller renders untrusted values using text nodes and keeps storage failures visible without losing data.

**Tech Stack:** Existing Astro 5, TypeScript, plain CSS, native DOM/localStorage, Node's test runner, Astro Container API and existing Vite. No new runtime dependencies or authentication changes.

## Approved design and boundaries

- Source: option A from the browser comparison, confirmed by “la opcion a, implementa”. Restrained light neutrals, one deep-green accent, system sans, persistent desktop navigation and compact mobile navigation. Context: a personal account reviewed during a normally lit workday, with quick access to existing settings.
- Keep `/logout`, `/settings/passkey`, `/settings/2fa`, `/settings/api-keys`, `/settings/organizations`, and admin-only `/admin` plus `/api/auth/reference`. Show real profile/image/role/email verification, not mockup names or invented security metrics.
- Keep `secure_notes_data` and existing records. Notes remain explicitly unencrypted and browser-local. Add/reveal/hide/delete still work. Never interpolate notes into `innerHTML` or attributes; keep reveal/delete visible to touch and keyboard users.
- Keep labels, required-field validation, visible focus, a skip link and polite success/alert error feedback. Storage access, malformed saved data and failed writes must not silently erase existing notes or clear an unsaved draft.
- No Go/Rust/DB/deployment changes, static migration, settings-screen redesign or prototype switcher in the application. Leave shared `Layout.astro` unchanged. Do not add demo auth bypasses.

## File map

| File | Responsibility |
| --- | --- |
| `src/pages/dashboard.astro` | Existing auth boundary, delegate presentation only |
| `src/layouts/DashboardLayout.astro` | Dashboard-only document/head/light theme |
| `src/components/dashboard/Dashboard.astro` | Approved account/navigation/settings presentation and conditional admin links |
| `src/components/dashboard/Icon.astro` | Small allowlisted inline SVG icons, no new icon package |
| `src/components/dashboard/Notes.astro` | Local-note form, list, empty/error/status regions and client initialization |
| `src/components/dashboard/notes.ts` | Safe DOM rendering and add/reveal/hide/delete interactions |
| `src/lib/dashboard-notes.ts` | Backward-compatible storage validation/write/masking helpers |
| `src/styles/dashboard.css` | Isolated responsive theme, wrapping and interactive states |
| `tests/dashboard-notes.test.ts` | Legacy notes, malformed/blocked storage, failed writes and masking |
| `tests/dashboard.test.mjs` | Real Astro-rendered identity, links, labels, admin visibility and escaping |
| `tests/helpers/dashboard-fixture.mjs` | Isolated Astro/Vite component renderer; optional loopback browser fixture, no auth or database import |

## Task 1: Test first

- [x] Use an isolated `getViteConfig({}, { configFile: false, ... })` / Astro Container fixture with an external cache/env directory. Render the actual dashboard with fictional user props; never load the application authentication configuration.
- [x] Add storage tests before the module, including:

```ts
assert.deepEqual(readNotes(storageWith(JSON.stringify(legacy))), legacy);
assert.throws(() => readNotes(storageWith('{')));
assert.throws(() => readNotes({ getItem() { throw new Error('blocked'); } }));
assert.throws(() => writeNotes({ setItem() { throw new Error('quota'); } }, legacy));
assert.equal(maskSecret('a-secret'), '••••••••');
```

- [x] Add rendered component tests for the exact settings/logout destinations, admin-only links, escaped name/email, real verification badge, labeled title/content fields and accurate local-only copy. Observe missing-module/API RED separately from behavioral regressions.
- [x] Run `node --import tsx --test tests/dashboard-notes.test.ts` and `node --test tests/dashboard.test.mjs`; record RED.

## Task 2: Approved presentation and working notes

- [x] Implement `readNotes(storage)`, `writeNotes(storage, notes)` and `maskSecret(secret)` without global browser access on import. `readNotes` accepts the existing array/record shape; corrupt data throws without overwriting it. `writeNotes` propagates failures.
- [x] Implement native DOM rendering with `createElement`, `textContent` and `replaceChildren`. Only update the rendered state after `setItem` succeeds. Preserve a draft on failure; disable overwrite when existing storage is unreadable and provide retry.
- [x] Supply the real signed-in `user` to the new dashboard component. Replace only the old markup/script in the route, retaining its session block exactly. Render icons from a fixed allowlist and use escaped Astro interpolation.
- [x] Add the dedicated light layout and responsive CSS. Use the supplied A hierarchy rather than promoting the throwaway prototype code or data. Keep a content field in the working notes form even though the visual sketch simplified it.
- [x] Run the focused tests GREEN. Check long names/emails/notes, empty profile image and verified/unverified/admin cases.

## Task 3: Verify and deliver

- [x] Use an owned loopback fixture of the actual Astro component for Chrome desktop/mobile checks and real notes interaction, including inert hostile text, persistence, reveal/hide/delete, storage failure and keyboard focus. The fixture must not become a production route or replace real auth.
- [x] Verify `/dashboard` without a session on `auth.localhost` still redirects, and shared login/settings code is unchanged. Do not create accounts or alter a real session merely to take screenshots.
- [x] Run focused tests and the existing local/config and static-candidate checks that can execute without external services. Validate the dashboard's actual Astro/TypeScript compilation and scoped CSS. Do not print environment secrets through the production build wrapper.
- [x] Inspect Git diff/status, preserve the pre-existing Go index/worktree, and report exact verification/limitations. No push/deployment or unrelated commits. If committing a checkpoint, use explicit owned paths only.

## Rollback boundary

The route's delegated markup plus the new dashboard layout/components/styles/helpers/tests and this plan. Existing auth/session logic, shared layout, settings routes, Go, Rust, databases and static SvelteKit candidate remain outside the change.

## Verification record

```bash
node --import tsx --test tests/dashboard-notes.test.ts tests/dashboard.test.mjs
node --test tests/dashboard-browser.test.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM src/lib/dashboard-notes.ts src/components/dashboard/notes.ts
node --test tests/local-config.test.mjs tests/kit-config.test.mjs
node --import tsx --test tests/local-auth.test.mjs tests/local-integration.test.ts
node --test --test-concurrency=1 tests/kit-login.test.mjs tests/kit-passkeys.test.mjs tests/kit-api-key-dialog.test.mjs tests/kit-api-keys.test.mjs
```

- Missing-module RED observed for both new storage and Astro presentation before implementation. Storage/rendering: **10 passed**.
- Actual Chrome/CDP tests: **11 passed**, including legacy hostile text, full masking/reveal/hide, creation/persistence/deletion, confirmation/focus, failed writes, corrupt/denied storage, retry, stale add/delete, long profile/note wrapping at 1440, 390 and 320 pixels, control contrast and live-region exposure. Requires Chrome (`DASHBOARD_CHROME_BIN`, default `/usr/bin/google-chrome`). Each run uses its own temporary profile and no real account.
- Astro 5's Container already emits **the actual compiled `Notes.astro` client script**. The fixture uses that native script without injecting another initializer. A first-success assertion caught and eliminated a duplicate script in the test harness. Astro components compile through Vite/Container; the new TypeScript modules pass the focused strict compiler command. This is not a full production deployment/build claim.
- Stale-state regression observed before correction: add and delete both discarded a note written after page load. Re-reading storage before applying each mutation makes both tests pass. This preserves the former sequential re-read behavior, not atomic cross-tab compare-and-swap.
- Config/local/candidate regression suites: **12 + 7 + 43 passed**. No external email, production DB, authenticated-user mutation or deployment was used.
- The executable authentication/user-selection block compares **byte-for-byte identical** to HEAD. An anonymous request to the real `http://auth.localhost/dashboard` still returned **302 to `/`**. All 16 Go-reference SHA256 values matched; shared layout/global CSS/auth/config/package/Kit/Rust paths are unchanged.
- Screenshots of the actual rendered component are `/tmp/opencode/auth-dashboard-implemented-{1440,390,320}.png`, with fictional fixture profile data. Desktop and narrow mobile layouts were visually reviewed.
- Independent production-source review found no auth/data blockers and two accessibility P2s. Both conditions were reproduced in Chrome before fixing: 1.44:1 editable-field boundary contrast and an empty success region hidden with `display:none`. A separate control-border token now meets 3:1; the empty `role=status` stays rendered. Chrome's accessibility tree confirms the empty status node is exposed before its first successful message. No NVDA/JAWS speech or full WCAG compliance claim is made.
- Final aggregate run: **83 passed, 0 failed, 0 skipped** across the 21 new dashboard tests and 62 existing local/config/candidate tests. Focused strict TypeScript and `git diff --check` also passed.
- Delivery is the working-tree implementation. No existing Go index entries were staged or reverted, and no UI commit, push or deployment was performed.
