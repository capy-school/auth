# CI dockerizado de validación ligera

**Estado:** implementado y verificado localmente. Sin commit, push ni despliegue.

## Objetivo

Ejecutar en GitHub Actions una validación ligera del frontend SvelteKit dentro de un contenedor Docker construido por el propio workflow. El contenedor no construye la imagen de aplicación, no publica artefactos y no recibe variables de aplicación ni secretos.

## Decisiones

- Workflow en `.github/workflows/ci.yml`, con `push` a `railway`, `pull_request` y ejecución manual.
- Runner `ubuntu-latest`; el workflow construye una imagen CI con `docker build` y ejecuta los chequeos con `docker run`. No se usa `container:` ni se hereda el entorno del runner.
- Imagen CI en `docker/ci/Dockerfile`: base `node:24-bookworm-slim` fijada por digest y binario `bun` copiado desde `oven/bun:1.3.14`, también fijado por digest. Bun instala el lockfile; Node ejecuta el runner de pruebas.
- Usuario no-root, sin `.env`, sin backend, sin Chrome, sin Docker dentro del contenedor y sin secretos.
- Contexto limitado por `docker/ci/Dockerfile.dockerignore` a lo necesario para check, build y pruebas unitarias seleccionadas.
- Variables: el contenedor no recibe variables de aplicación. `docker run` no usa `--env-file`, no pasa `-e` sin valor y solo fija explícitamente `CI=true` y `TZ=UTC`. Cualquier variable futura deberá declararse por nombre en el workflow.

## Validación ejecutada

1. `bun run kit:check`
2. `bun run kit:build`
3. `node --import tsx --test --test-concurrency=1` sobre:
   - `tests/kit-app-auth.test.ts`
   - `tests/kit-app-build.test.mjs`
   - `tests/kit-config.test.mjs`
   - `tests/kit-app-proxy.test.mjs`
   - `tests/kit-app-redirect.test.mjs`
   - `tests/kit-app-login.test.mjs`

No se ejecutan pruebas que requieran Chrome, la imagen de aplicación, TLS, contenedores anidados ni proveedores externos.

## Seguridad y límites

- Permisos del workflow: `contents: read`.
- Checkout pinneado por commit y con `persist-credentials: false`.
- Contenedor sin privilegios: `--cap-drop ALL`, `--security-opt no-new-privileges`, usuario no-root y, si la verificación local lo permite, `--network none`.
- No hay publicación en GHCR, push de imágenes, despliegue, migraciones ni acceso a bases de datos.
- El CI no demuestra aceptación de la imagen `tiny`, TLS de upstream, compresión ni recorridos de navegador; esas comprobaciones pertenecen al flujo local de imagen.

## Criterios de aceptación

- `docker build -f docker/ci/Dockerfile -t auth-ci:local .` termina correctamente.
- El contenedor ejecuta los tres pasos sin fallos y sin acceso a red externa. En este host se verificó con Podman sobre la misma imagen OCI porque Docker Desktop no inicia contenedores nuevos; el workflow usa Docker en un runner limpio.
- Una variable centinela exportada en el host no aparece dentro del contenedor.
- El workflow es YAML válido y declara únicamente los eventos, permisos y variables previstos.
- No se modifica el comportamiento de la aplicación ni el trabajo Go/Rust pendiente.
