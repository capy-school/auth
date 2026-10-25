# Strictly static SvelteKit candidate on Cloudflare

Generate the existing SvelteKit candidate as public HTML and assets during the build. Cloudflare serves files without a SvelteKit request-time renderer. This first unit does not replace the current Astro application or implement authentication.

## Approved direction

The user approved `adapter-static` for the first cut on 2026-10-25. Keep Cloudflare hosting, preserve the database, and continue the existing Go authentication work after this unit. The final application will use prerendered menus and browser-side session checks, with authorization enforced by the API.

This is static site generation, not an empty client-only SPA: keep SSR enabled **during the build**. No request-time SSR is permitted in the candidate's deployment artifact.

## First-unit boundaries

| Included | Not included |
| --- | --- |
| Convert the existing diagnostic and presentation routes to static output | Port the real dashboard, navigation, or remaining settings |
| Preserve interactive Svelte hydration and disconnected-preview warnings | Connect session checks, SDKs, accounts, or authentication |
| Asset-only candidate Cloudflare configuration | Deploy, change domains, or switch default Astro commands |
| Build-artifact and regression checks | Modify Go work, secrets, or the existing database |

Go currently has domain models, typed repository ports, Turso CRUD and transaction support, but no HTTP authentication service. Do not describe it as a functioning replacement for Better Auth. Its existing staged and untracked work must remain untouched.

## Build and hosting contract

- Pin `@sveltejs/adapter-static` to `3.0.10`, whose published peer range supports the installed SvelteKit `2.70.3`. The current adapter-static `4.0.0` requires Kit 3 and must not upgrade this project.
- Configure the static adapter with `strict: true`, no SPA fallback, and both pages and assets written to `.svelte-kit/static/`.
- Set root page options to `prerender = true`, `ssr = true`, `csr = true`, and `trailingSlash = 'always'`. Every existing preview gets a real `index.html`; browser interaction remains enabled.
- Replace the dynamic `/__migration/health` endpoint with prerendered `/__migration/build.json`. This is fixed, non-sensitive build metadata, explicitly **not** a runtime service-health check. Update the diagnostic link and its HTTP assertions.
- Make `wrangler.sveltekit.jsonc` asset-only: point `assets.directory` at `.svelte-kit/static`, with no Worker `main`, data binding, Node compatibility flag, custom domain, or production route. Retain disabled worker development and preview URLs. Do not add a deployment command.
- Leave the root Astro config, Wrangler config, TypeScript config, default commands, source files, and authentication dependencies unchanged. Preserve pinned framework versions and existing-consumer dependency resolutions.
- Build-time intermediate server code under `.svelte-kit/output` is expected for prerendering. It must not be shipped in `.svelte-kit/static`; the deployable directory must contain no SSR Worker or server manifest.

## Runtime and cache boundaries

In this unit all previews remain disconnected: no session check or private data is added. Later, the same public HTML will be delivered to every visitor and a browser script will request the session, rendering a neutral state until the result is known.

Client checks control presentation only. The future Go API must verify sessions and permissions independently for every protected operation. Authentication and personalized responses must bypass shared cache and use explicit `no-store` policies; public HTML must not contain identities, cookies, tokens, or account data.

The frontend is eligible for static asset caching and performs no request-time rendering. This is not a promise of a literal 100% cache HIT rate: cold caches, revalidation and eviction remain possible. No cache policy is changed on the existing production authentication API in this unit.

## Failure handling

- A route that cannot be prerendered fails the build rather than falling back to SSR or an SPA shell.
- Missing pages, assets, and API routes remain missing; no catch-all rewrites may turn them into login HTML.
- Existing `/` and `/api/auth/*` remain absent from the isolated candidate. Removing Astro requires a later parity and cutover decision.
- Private root environment files remain outside candidate environment discovery and Vite's serving allowlist.

## Acceptance checks

1. Observe a failing contract test for the old adapter, missing prerender options, and runtime Worker configuration before changing implementation.
2. Configuration tests preserve candidate source/environment isolation and unchanged Astro operation while requiring the strict static adapter and asset-only Cloudflare config.
3. A fresh candidate build emits all five preview HTML files and the static build JSON. Assert visible initial controls in the generated HTML, hydration assets, and the absence of a deployable SSR Worker, API, or server manifest.
4. Serve the artifact with a plain static file server: verify page/JSON/asset responses, no `Set-Cookie`, and missing API/root routes without invoking SvelteKit's development renderer. Do not claim this proves deployed CDN cache behavior.
5. Retain the rendered login/passkey/API-key suites and candidate type checks. Update the development-only HTTP suite for the renamed diagnostic, retaining stylesheet allow/deny regressions.
6. Check dependency changes and final Git status/diff; preserve every pre-existing Go change. Do not run production DB operations, deploy, or print root environment values.

## Next unit

Continue Go from its existing repositories rather than rebuilding persistence. Scope a compatible session-validation use case and HTTP boundary before wiring browser checks. Go compute placement, production integration, full magic-link/2FA/OAuth/SSO parity, and cutover are separate decisions; this unit does not select new infrastructure.
