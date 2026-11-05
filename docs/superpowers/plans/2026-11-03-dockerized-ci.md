# CI dockerizado de validación ligera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. No commits: el usuario mantiene la restricción de no crear commits/push sin autorización.

**Goal:** Añadir un workflow de GitHub Actions que valide el frontend SvelteKit dentro de una imagen CI no privilegiada, recibiendo únicamente el entorno mínimo declarado.

**Architecture:** El runner construye `docker/ci/Dockerfile` con Node 24 y Bun fijados por digest. La imagen instala el lockfile con Bun, ejecuta `kit:check`, `kit:build` y seis pruebas unitarias con Node, y se lanza con `docker run` sin `--env-file` ni variables de aplicación. Un test centinela demuestra que el entorno del runner no se hereda.

**Tech Stack:** GitHub Actions, Docker BuildKit, Node 24, Bun 1.3.14, SvelteKit 2, Python/PyYAML para validar el workflow.

---

## Reglas de ejecución

- No crear commits, push, imágenes públicas, despliegues ni cambios en `server/` o `server-rust/`.
- No modificar la imagen de aplicación (`Dockerfile`, `docker/assets.py`, `docker/nginx.py`, `docker/launcher/`).
- Mantener el staging Go existente intacto.
- El CI no recibe secretos ni variables de aplicación.

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `docker/ci/Dockerfile` | Imagen CI no privilegiada con Node/Bun y los chequeos. |
| `docker/ci/Dockerfile.dockerignore` | Contexto mínimo, sin `.env`, backend ni artefactos. |
| `.github/workflows/ci.yml` | Disparadores, permisos, build y ejecución con entorno explícito. |
| `README.md` | Sección breve de uso del CI. |
| `docs/superpowers/specs/2026-11-03-dockerized-ci-design.md` | Diseño aprobado. |

## Task 1 — Imagen CI y contexto mínimo

**Files:**
- Create: `docker/ci/Dockerfile`
- Create: `docker/ci/Dockerfile.dockerignore`

- [x] **Step 1: Crear `docker/ci/Dockerfile`.**

```dockerfile
# syntax=docker/dockerfile:1
ARG BUN_IMAGE=oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

FROM ${BUN_IMAGE} AS bun

FROM ${NODE_IMAGE}

RUN groupadd --gid 10001 ci \
    && useradd --uid 10001 --gid ci --create-home --shell /usr/sbin/nologin ci

WORKDIR /app

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY svelte.config.js vite.sveltekit.config.ts tsconfig.json tsconfig.sveltekit.json wrangler.sveltekit.jsonc .gitignore ./
COPY src/kit/ ./src/kit/
COPY src/styles/ ./src/styles/
COPY src/components/account/ ./src/components/account/
COPY src/lib/auth-client.ts src/lib/local-policy.mjs src/lib/apps.ts src/lib/local-client.ts src/lib/local-inbox.mjs src/lib/dashboard-notes.ts ./src/lib/
COPY scripts/kit-proxy.mjs ./scripts/kit-proxy.mjs
COPY public/ ./public/
COPY tests/kit-app-auth.test.ts tests/kit-app-build.test.mjs tests/kit-config.test.mjs tests/kit-app-proxy.test.mjs tests/kit-app-redirect.test.mjs tests/kit-app-login.test.mjs ./tests/

RUN mkdir -p .svelte-kit && chown -R ci:ci /app

USER ci
ENV CI=true \
    TZ=UTC

CMD ["sh", "-c", "npm run kit:check && npm run kit:build && node --import tsx --test --test-concurrency=1 tests/kit-app-auth.test.ts tests/kit-app-build.test.mjs tests/kit-config.test.mjs tests/kit-app-proxy.test.mjs tests/kit-app-redirect.test.mjs tests/kit-app-login.test.mjs"]
```

- [x] **Step 2: Crear `docker/ci/Dockerfile.dockerignore`.**

```gitignore
# Start closed; only the CI image inputs are allowed.
**
!docker/ci/Dockerfile
!docker/ci/Dockerfile.dockerignore
!package.json
!bun.lock
!svelte.config.js
!vite.sveltekit.config.ts
!tsconfig.json
!tsconfig.sveltekit.json
!wrangler.sveltekit.jsonc
!.gitignore
!public/
!public/**
public/.assetsignore
!src/kit/
!src/kit/**
!src/styles/
!src/styles/**
!src/components/account/
!src/components/account/**
!src/lib/
!src/lib/auth-client.ts
!src/lib/local-policy.mjs
!src/lib/apps.ts
!src/lib/local-client.ts
!src/lib/local-inbox.mjs
!src/lib/dashboard-notes.ts
!scripts/
!scripts/kit-proxy.mjs
!tests/
!tests/kit-app-auth.test.ts
!tests/kit-app-build.test.mjs
!tests/kit-config.test.mjs
!tests/kit-app-proxy.test.mjs
!tests/kit-app-redirect.test.mjs
!tests/kit-app-login.test.mjs

# Defence in depth, including secrets nested in otherwise allowed paths.
**/.env*
**/.dev.vars*
**/.npmrc
**/.yarnrc*
**/.git
**/.git/**
**/node_modules
**/.svelte-kit
**/dist
**/coverage
**/__pycache__
```

- [x] **Step 3: Verificar que el contexto no incluye secretos.**

```bash
grep -nE '(^|[^!])(\.env|server/|server-rust/|node_modules|\.git)' docker/ci/Dockerfile.dockerignore
```

Expected: solo aparecen las exclusiones de defensa; no hay reglas que abran `.env`, `server/`, `server-rust/`, `node_modules` ni `.git`.

- [x] **Step 4: Construir la imagen CI.**

```bash
docker build --file docker/ci/Dockerfile --tag auth-ci:local .
```

Expected: exit 0. Si BuildKit no aplica `Dockerfile.dockerignore`, el build fallará por archivos ausentes; en ese caso comprobar que se usa `docker build` moderno/BuildKit y no desactivar la comprobación.

## Task 2 — Workflow de GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

- [x] **Step 1: Crear el workflow.**

```yaml
name: CI

on:
  push:
    branches: [railway]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate in Docker
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        # actions/checkout v4, pinned by commit.
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false

      - name: Build CI image
        env:
          DOCKER_BUILDKIT: "1"
        run: docker build --pull --file docker/ci/Dockerfile --tag "auth-ci:${GITHUB_SHA}" .

      - name: Validate with only declared environment
        run: |
          docker run --rm \
            --cap-drop ALL \
            --security-opt no-new-privileges \
            --network none \
            --env CI=true \
            --env TZ=UTC \
            "auth-ci:${GITHUB_SHA}"

      - name: Prove host environment is not inherited
        run: |
          SENTINEL_CI_SECRET=do-not-leak docker run --rm \
            --cap-drop ALL \
            --security-opt no-new-privileges \
            --network none \
            --entrypoint sh \
            "auth-ci:${GITHUB_SHA}" \
            -c 'test -z "${SENTINEL_CI_SECRET:-}" && test -z "${API_UPSTREAM:-}"'
```

- [x] **Step 2: Validar YAML y política del workflow.**

```bash
python3 - <<'PY'
from pathlib import Path
import yaml
workflow = yaml.safe_load(Path('.github/workflows/ci.yml').read_text())
assert workflow['permissions'] == {'contents': 'read'}
triggers = workflow.get('on', workflow.get(True))
assert 'workflow_dispatch' in triggers
assert 'pull_request' in triggers
steps = workflow['jobs']['validate']['steps']
text = Path('.github/workflows/ci.yml').read_text()
assert '--env-file' not in text
assert '--env CI=true' in text and '--env TZ=UTC' in text
assert '--env API_UPSTREAM' not in text
assert 'push: true' not in text and 'ghcr.io' not in text
print('workflow policy checks passed')
PY
```

Expected: `workflow policy checks passed`.

## Task 3 — Verificación local de la imagen CI

- [x] **Step 1: Ejecutar la validación con el mismo entorno mínimo del workflow.**

```bash
docker run --rm \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --network none \
  --env CI=true \
  --env TZ=UTC \
  auth-ci:local
```

Expected: `kit:check` con 0 errores/0 warnings, `kit:build` correcto y seis pruebas con 0 fallos. Guardar el conteo real.

- [x] **Step 2: Demostrar que el entorno del host no se hereda.**

```bash
SENTINEL_CI_SECRET=do-not-leak docker run --rm \
  --entrypoint sh \
  --network none \
  auth-ci:local \
  -c 'test -z "${SENTINEL_CI_SECRET:-}" && echo no-host-env-leak'
```

Expected: `no-host-env-leak`.

- [x] **Step 3: Confirmar usuario no-root.**

```bash
docker run --rm --network none --entrypoint id auth-ci:local
```

Expected: `uid=10001(ci)`.

- [x] **Step 4: Inspeccionar que no hay variables de aplicación horneadas.**

```bash
docker image inspect auth-ci:local --format '{{json .Config.Env}}'
```

Expected: solo variables base de la imagen Node y `CI=true`, `TZ=UTC`; no `API_UPSTREAM`, tokens ni secretos.

## Task 4 — Documentación y guardas

**Files:**
- Modify: `README.md`

- [x] **Step 1: Añadir una sección breve en `README.md`.**

```markdown
### CI

El workflow `.github/workflows/ci.yml` valida el frontend en una imagen Docker
propia. No publica imágenes ni despliega. El contenedor no recibe variables de
aplicación ni secretos: solo `CI=true` y `TZ=UTC` se declaran explícitamente.

```bash
docker build -f docker/ci/Dockerfile -t auth-ci:local .
docker run --rm --cap-drop ALL --security-opt no-new-privileges \
  --network none -e CI=true -e TZ=UTC auth-ci:local
```
```

- [x] **Step 2: Verificar el estado Git y el staging Go.**

```bash
git diff --check
python3 - <<'PY'
from pathlib import Path
import hashlib, json, subprocess
baseline = json.loads(Path('/tmp/opencode/auth-static-baseline/state.json').read_text())
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == baseline['head']
assert hashlib.sha256(subprocess.check_output(['git', 'diff', '--cached', '--binary'])).hexdigest() == baseline['cached_sha256']
for name, digest in baseline['protected'].items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest, name
print('protected files and staged diff unchanged')
PY
```

Expected: `protected files and staged diff unchanged`. No commit.

## Recibos de ejecución

- `docker build --file docker/ci/Dockerfile --tag auth-ci:local .`: correcto.
- `podman run --rm --cap-drop ALL --security-opt no-new-privileges --network none --env CI=true --env TZ=UTC auth-ci:local`: `kit:check` con **0 errores/0 warnings**, `kit:build` correcto y **33 pruebas pasan, 0 fallan, 0 omitidas**.
- `podman run ... --entrypoint id`: `uid=10001(ci)`.
- `SENTINEL_CI_SECRET=do-not-leak podman run ... --entrypoint sh ...`: `no-host-env-leak`.
- `podman image inspect ... --format '{{json .Config.Env}}'`: solo `PATH`, `NODE_VERSION`, `YARN_VERSION`, `CI=true`, `TZ=UTC`; sin variables de aplicación.
- `podman run ... --entrypoint sh ...`: no existen `/app/.env`, `/app/server`, `/app/server-rust` ni `/app/.git`.
- Validación del workflow con PyYAML y `actionlint`: permisos `contents: read`, triggers `pull_request`/`workflow_dispatch`, sin `--env-file`, sin variables de aplicación inyectadas y sin publicación.
- Guardas: `HEAD` sigue en `4fe9d610089dbe68eef2515b5df29df876567dad`; SHA-256 del diff staged `7372e7f7f17a0941c11108774eec3a1ff84c44960e8d391561d4665d2000056f`; sin commits ni push. `git diff --check` y whitespace de archivos nuevos correctos.

**Limitación local:** Docker Desktop en este host deja de iniciar contenedores nuevos (`docker start` se cuelga), aunque `docker build` funciona. La ejecución del contenedor se verificó con Podman sobre la misma imagen OCI. El workflow usa el Docker del runner de GitHub, que es un entorno limpio; no se cambió el diseño por esta limitación del host.

## Self-review

- Cobertura: imagen CI, contexto mínimo, workflow, entorno explícito, test centinela, no-root, documentación y guardas.
- Sin secretos, sin publicación, sin despliegue, sin Chrome y sin imagen de aplicación.
- La lista de pruebas coincide con la del spec.
- No se incluyen pasos de commit por la restricción del usuario.
