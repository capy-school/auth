# syntax=docker/dockerfile:1
ARG BUN_IMAGE=oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

FROM ${BUN_IMAGE} AS bun

FROM ${NODE_IMAGE}

RUN groupadd --gid 10001 ci \
    && useradd --uid 10001 --gid ci --create-home --shell /usr/sbin/nologin ci

WORKDIR /app
RUN chown ci:ci /app

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
USER ci

COPY --chown=ci:ci package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY --chown=ci:ci svelte.config.js vite.sveltekit.config.ts tsconfig.json tsconfig.sveltekit.json wrangler.sveltekit.jsonc .gitignore ./
COPY --chown=ci:ci src/kit/ ./src/kit/
COPY --chown=ci:ci src/styles/ ./src/styles/
COPY --chown=ci:ci src/components/account/ ./src/components/account/
COPY --chown=ci:ci src/lib/auth-client.ts src/lib/local-policy.mjs src/lib/apps.ts src/lib/local-client.ts src/lib/local-inbox.mjs src/lib/dashboard-notes.ts ./src/lib/
COPY --chown=ci:ci scripts/kit-proxy.mjs ./scripts/kit-proxy.mjs
COPY --chown=ci:ci public/ ./public/
COPY --chown=ci:ci tests/kit-app-auth.test.ts tests/kit-app-build.test.mjs tests/kit-config.test.mjs tests/kit-app-proxy.test.mjs tests/kit-app-redirect.test.mjs tests/kit-app-login.test.mjs ./tests/
RUN mkdir -p .svelte-kit

ENV CI=true \
    TZ=UTC

CMD ["sh", "-c", "npm run kit:check && npm run kit:build && node --import tsx --test --test-concurrency=1 tests/kit-app-auth.test.ts tests/kit-app-build.test.mjs tests/kit-config.test.mjs tests/kit-app-proxy.test.mjs tests/kit-app-redirect.test.mjs tests/kit-app-login.test.mjs"]
