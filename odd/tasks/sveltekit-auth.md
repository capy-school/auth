# SvelteKit Auth Migration

## Goal and authorization
Migrate the current authentication application from Astro/React islands to SvelteKit, retain its authentication service, redesign the interface, and simplify operation in four sequential phases. The user explicitly authorized committing existing pending work first, then executing all four phases.

## Architecture and constraints
Use SvelteKit with its Cloudflare adapter, Svelte components, Better Auth, existing Turso/Kysely persistence, and Tailwind. No Hono or separate API deployment is required. Preserve public API paths, app/redirect parameters, provider callback paths, domain/cookie behavior, legacy SSO completion exceptions, secrets and database contents. Keep local SQLite/inbox isolation. Do not publish, push, merge, or change production infrastructure. Do not make simulated 2FA, OTP or tenant migrations appear production-ready.

Existing pending work on branch `cf` is the requested baseline. Exclude `.env*`, databases, local runtime state, generated output and `.codegraph/` from commits. Checkpoint work on a dedicated feature branch. Tests, documentation and behavior belong in the same reviewable work units. No deploy before backend and authentication parity checks.

## Tasks
- [x] T1 — Verify and checkpoint existing local-auth and SSO work. Status: done. Commit: `5f35093dedbf681f1d6092cbe5cd123ad7b05a7c`. Local tests and build passed; HTTP/live external coverage gaps are recorded below. Native review approved and acknowledged.
- [ ] T2 — Phase 1: introduce an additive, non-default SvelteKit/Cloudflare candidate. Status: in_progress. Keep Astro commands, root TypeScript config and production Wrangler unchanged. Use isolated `src/kit/` routes/template/lib/hooks, a separate candidate Wrangler config without production routes, a diagnostic page and a server health endpoint. No auth imports or proxy in this unit. Acceptance: test-first configuration contract, type check, candidate Worker build, diagnostic/health HTTP smoke without silent skips, unchanged Astro tests/build, no auth or local filesystem modules in generated client/Worker graphs. Preserve Better Auth 1.3.34 and better-call 1.0.19; verify installed framework/adapter APIs rather than assuming latest docs apply.
- [ ] T3 — Phase 1: migrate login and core navigation to Svelte components. Status: pending. Preserve authentication providers and public return parameters. Acceptance: deterministic login-policy checks and applicable browser smoke checks.
- [ ] T4 — Phase 1: migrate dashboard and settings interfaces to Svelte. Status: pending. Preserve existing functional behavior, clearly identifying demonstrations. Acceptance: component/type/build checks and browser interaction smoke checks.
- [ ] T5 — Phase 2: migrate authentication/resource endpoints, session guards, SSO and local runtime integration. Status: pending. Acceptance: isolated magic-link/session/token tests, API authorization checks, preserved host/cookie/redirect contracts, Worker build. Remove obsolete Astro/React wiring only once parity is demonstrated.
- [ ] T6 — Phase 2: unify trusted continuation resolution and post-login navigation. Status: pending. Acceptance: test-first query precedence, invalid destination, absent/valid/expired session, storage candidate validation and loop-prevention cases. Resolve behavior changes explicitly rather than silently changing existing contracts.
- [ ] T7 — Phase 3: redesign login/settings presentation and accessibility. Status: pending. Agree a concrete visual direction before UI redesign. Acceptance: responsive layout, keyboard/focus behavior, loading/error states and browser verification.
- [ ] T8 — Phase 4: simplify approved flows and remove redundant implementation. Status: pending. Derive concrete proposals from migrated behavior; user chooses any product-level removal or change. Acceptance: regression checks for retained contracts and updated operational documentation.

## Checks and review
Use test-first for applicable deterministic behavior changes; record observed RED and GREEN. Passive configuration or presentation changes without meaningful RED receive structural and functional checks. Bounded writers self-verify exact authorized commands; independent verification follows native ASSESS and the user-owned RDD setting. Each completed task requires a work-unit commit and recorded verification evidence. OAuth providers, passkeys and live dual-domain SSO require suitable browser/credential environments; report unavailable checks honestly.

## Progress and evidence
Initial read-only maps identified eight pages, five React components, seventeen API route files, significant imperative DOM scripts, server-rendered Astro configuration and Cloudflare deployment. Home currently resolves session after hydration; signed-in and newly signed-in destination precedence differ. No migration source edits have been made.

Work is on feature branch `feat/sveltekit-auth`. T1 verification and bounded read-only planning completed.

T1 evidence: `bun run test:local` exited 0 (10 passed, 2 HTTP tests skipped because `AUTH_LOCAL_SMOKE_URL` was not configured). `bun run build` exited 0 (Cloudflare output), with Node deprecation, local filesystem externalization and unsupported runtime Sharp warnings. `git diff --check` and the staged diff check passed. OAuth, passkeys and live cross-domain SSO were not exercised. Source-only pattern scanning found no recognized credential literals, but was not a comprehensive security/history audit.

Native review `review-c3eaf16cb3546675` classified the 612-line baseline as high risk, ran all four lenses, approved, and burned authority through exact acknowledgement. Non-blocking followups: consumer completion HTTP coverage (`tests/local-http.test.mjs:60-65`) and database URL encoding (`src/db/client.ts:12`). These do not reopen this review.

T2 bounded plan: source coexistence only. Astro remains the default functional app and sole production target while the Kit candidate is incomplete. Candidate presentation does not prove authentication parity. Before Phase 2 reuse, introduce an explicit server-owned environment/auth factory seam; keep Node filesystem/local SQLite modules outside the Worker graph. Current environment injection and version-sensitive SSO cookie internals cannot be copied blindly.

T1 security hygiene: `.env.local` was already tracked despite ignore rules. Removed it from the Git index with `git rm --cached`, preserving the local file and keeping its contents undisclosed. Its deletion is included in the baseline checkpoint; previous history remains unchanged. Legacy `local.db` was likewise removed from tracking while preserved locally, with its sidecars and `.codegraph/` explicitly ignored. If historical files contained real credentials, rotation is required. No credential/database-content assessment was performed.

The task decomposition may be refined by the read-only plan without expanding approved product scope.

## Commit evidence
- T1: `5f35093dedbf681f1d6092cbe5cd123ad7b05a7c` — `feat(auth): add isolated local authentication workflow`.

Next action: implement and verify the additive T2 scaffold through one bounded writer. Later large phase tasks will be split into behavior-sized work units before execution, without expanding product scope.

## Delivery
Local feature work only. No push, PR, merge or production deployment is authorized. Review scope is each work-unit candidate, not the accumulated feature branch.
