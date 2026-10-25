# Cloudflare Static Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user selected inline execution in the existing checkout; do not create a worktree or modify existing Go work.

**Goal:** Build the existing SvelteKit candidate as prerendered HTML and assets, without a deployable request-time renderer.

**Architecture:** Use adapter-static 3.0.10 with strict prerendering and no fallback, retaining SvelteKit 2.70.3. Serve the isolated artifact through an asset-only Cloudflare configuration; retain all disconnected previews and current Astro production behavior.

**Tech Stack:** SvelteKit 2, Svelte 5, Vite 6, adapter-static 3.0.10, Node test runner, Cloudflare Static Assets.

---

## Boundaries and file map

- `tests/kit-config.test.mjs`: static adapter/options/route inventory and unchanged Astro/isolation contracts.
- `tests/kit-static.test.mjs` (new): built HTML/JSON/hydration assets and plain static-file HTTP checks.
- `tests/kit-http.test.mjs`: retain development serving protections, rename only the build metadata diagnostic.
- `package.json`, `bun.lock`: add exactly pinned static adapter; preserve existing tooling/auth resolutions.
- `svelte.config.js`: strict static adapter and output directory; retain isolated files and environment configuration.
- `src/kit/routes/+layout.ts` (new): build-time rendering and prerender policy.
- `src/kit/routes/__migration/build.json/+server.ts` (new): fixed build-only marker replacing `health/+server.ts`.
- `src/kit/routes/__migration/+page.svelte`: label and link the static marker honestly.
- `wrangler.sveltekit.jsonc`: files only; no Worker main or bindings.
- `README.md`, `odd/tasks/sveltekit-auth.md`: record the new artifact, commands, limits and evidence.

Do not edit `server/`, the existing Go plan/tracker, Astro config, root Wrangler/tsconfig, authentication sources, secrets or databases. Commit only explicit paths belonging to this unit. The spec is `docs/superpowers/specs/2026-10-25-cloudflare-static-candidate-design.md`.

## Task 1: Observe the missing static contract

- [ ] Update the candidate inventory to include `src/kit/routes/+layout.ts` and `src/kit/routes/__migration/build.json/+server.ts`, replacing the health endpoint.
- [ ] Add adapter-static `3.0.10` to the exact-version assertions. Require `config.kit.adapter.name === '@sveltejs/adapter-static'` and this adapter expression:

```js
adapter({
  pages: '.svelte-kit/static',
  assets: '.svelte-kit/static',
  strict: true,
})
```

- [ ] Add this root-options test, retaining the existing backend/import restrictions:

```js
test('pages render at build time without an SPA fallback', () => {
  const source = read('src/kit/routes/+layout.ts');
  for (const option of ['prerender', 'ssr', 'csr']) {
    assert.match(source, new RegExp(`export const ${option} = true;`));
  }
  assert.match(source, /export const trailingSlash = 'always';/);
  assert.doesNotMatch(read('svelte.config.js'), /\bfallback\s*:/);
  assert.match(read('src/kit/routes/__migration/build.json/+server.ts'), /export const prerender = true;/);
});
```

- [ ] Require the exact asset-only Wrangler object specified in Task 2. Update the exact source-route list to include root `+layout.ts` and build JSON instead of health.
- [ ] Add `tests/kit-static.test.mjs`: use `node:fs` to require `.svelte-kit/static` before enumerating it. Assert five real preview HTML files, their initial visible content, hydration imports/CSS, fixed JSON and no Worker/server artifact. Use `node:http` with an in-memory map of those files to serve exact bytes with no renderer or HTML fallback. Test missing root/API/asset/old-health paths as 404, no cookies, and identical public bytes with/without a synthetic cookie. Close the server using test cleanup. The exact marker is:

```js
const marker = {
  kind: 'static-build',
  candidate: 'sveltekit-static-diagnostic',
  authentication: false,
};
```

- [ ] Run `node --test tests/kit-config.test.mjs tests/kit-static.test.mjs`. Expect meaningful RED for the existing Cloudflare adapter/Worker config, absent root options/build marker and absent static output. Keep baseline failures and implementation failures distinct.

## Task 2: Produce the strictly static artifact

- [ ] Run `bun add --dev --exact @sveltejs/adapter-static@3.0.10`. Review the targeted package/lock diff; do not accept framework/auth upgrades or changes to existing consumer resolutions. Inspect the installed adapter source and peer manifest before configuring it.
- [ ] In `svelte.config.js`, replace the Cloudflare adapter import/object with the static adapter expression from Task 1. Preserve every other configuration key.
- [ ] Create `src/kit/routes/+layout.ts`:

```ts
export const prerender = true;
export const ssr = true;
export const csr = true;
export const trailingSlash = 'always';
```

- [ ] Delete only the obsolete candidate health handler. Create `src/kit/routes/__migration/build.json/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => json({
  kind: 'static-build',
  candidate: 'sveltekit-static-diagnostic',
  authentication: false,
});
```

- [ ] Replace the diagnostic health link with:

```svelte
<p>HTML is generated at build time; there is no request-time renderer.</p>
<p><a href="/__migration/build.json" data-sveltekit-reload>Static build JSON (not service health)</a></p>
```

- [ ] Replace only `wrangler.sveltekit.jsonc` with:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "auth-sveltekit-candidate",
  "compatibility_date": "2026-04-12",
  "workers_dev": false,
  "preview_urls": false,
  "assets": {
    "directory": ".svelte-kit/static"
  }
}
```

- [ ] Update `tests/kit-http.test.mjs`: require the new diagnostic link and build-time-rendering text; request `/__migration/build.json`, compare the exact marker, and remove the old runtime `no-store` health assertion. These public fixed bytes are not an auth response. Retain all preview, cookie, source allow/deny and missing API tests.
- [ ] Run `bun run kit:check`, then `node --test tests/kit-config.test.mjs`, `bun run kit:build`, and `node --test tests/kit-static.test.mjs`. Expect zero checker errors/warnings, passing config tests, five generated HTML pages plus build JSON, and passing plain-file artifact/HTTP checks.

## Task 3: Regressions, documentation and one functional commit

- [ ] Run the retained rendered suites serially to avoid shared Vite renderer state:

```bash
node --test --test-concurrency=1 tests/kit-login.test.mjs tests/kit-passkeys.test.mjs tests/kit-api-key-dialog.test.mjs tests/kit-api-keys.test.mjs
```

- [ ] Run the local baseline without building production or printing environment values:

```bash
bun run test:local
```

Expected: existing local tests pass; report the two known HTTP skips unless a separately authorized local origin exists. Do not connect a production database or run migrations.

- [ ] Start only the isolated candidate development server on loopback using `bun run kit:dev --host 127.0.0.1 --port 5173 --strictPort`. Run `KIT_SMOKE_URL=http://127.0.0.1:5173 node --test tests/kit-http.test.mjs` and stop only that owned process. All HTTP cases must pass without skips; adjust requests to canonical trailing-slash page paths because the approved static policy now canonicalizes them.
- [ ] Replace README's candidate-only section with the static artifact location, build/rendered/artifact/dev-check commands, build JSON semantics, unchanged Astro/default deployment, no SSR runtime, no auth parity, no deployment instruction and cache caveats. Add the approved architecture clarification and first-unit evidence to the existing SvelteKit tracker without marking dashboard/auth tasks complete.
- [ ] Run fresh final `kit:check`, config/rendered tests, `kit:build`, artifact tests and `git diff --check` for explicit candidate paths. Inspect the full diff and verify production config/default commands and pre-existing Go status remain unchanged.
- [ ] Commit implementation, tests, package/lock and user-facing docs together using explicit path arguments only. Intended message: `build(auth): prerender the Cloudflare candidate without SSR runtime`. Keep this work unit approximately below 400 authored changed lines; split by working behavior or report the real overage, never compress tests to fit.

## Completion evidence

Record commands and observed results, including RED/GREEN, static HTTP coverage, any known skips/advisories, dependency-impact review, exact work-unit commit and unchanged Go paths. Do not claim deployed cache HIT behavior, browser hydration acceptance, a migrated real dashboard, or working Go authentication from this build-only unit.

Rollback boundary: the candidate adapter/options/output config, build marker and corresponding tests/docs. The current Astro app, public auth API and Go persistence are independent and must remain intact.
