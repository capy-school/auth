# Frontend Migration Cleanup Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. El usuario ya aclaró el alcance: terminar el frontend ahora; BFF y reemplazo de API después. No se requiere otra elección de framework ni workspace.

**Goal:** Hacer SvelteKit el único frontend, retirar la duplicación y separar la API Astro vigente sin cambiar sus contratos.

**Architecture:** Layout convencional SvelteKit en raíz; workspace `api` para Astro/Better Auth; políticas puras en `shared`. Ninguna API de servidor Kit ni SSR en ejecución. Se conservan la UI A, proxy `/api`, variables runtime e invariantes de cuenta.

**Tech Stack:** Versiones fijadas existentes de SvelteKit/Svelte, Astro/Better Auth, Bun, Node, Nginx scratch y CI Docker.

## 1. Baseline y especificación ejecutable

- [x] Guardar hashes de Go/Rust/AGENTS y diff staged fuera del repo. Baseline: `/tmp/opencode/auth-frontend-cleanup/baseline.json`.
- [x] Escribir `tests/frontend-layout.test.mjs` exigiendo frontend único, API aparte, políticas compartidas puras y scripts/dependencias separados.
- [x] Ejecutar `node --test tests/frontend-layout.test.mjs` y confirmar RED antes de mover código.

## 2. Reorganizar sin cambiar autenticación

- [x] Trasladar `src/kit/{routes,lib,app.html,app.d.ts}` a `src/`; controladores `src/components/account/*.ts` a `src/lib/account/controllers`, tipos a `src/lib/account/types.ts`.
- [x] Trasladar API, configuración Astro/Cloudflare, DB y adaptadores de servidor a `api/`. Mantener la bandeja local, entorno y ubicación de DB existentes.
- [x] Mover registro/política sin efectos a `shared/`; retirar dependencia del registro respecto al cliente Astro. Actualizar imports y montaje explícito sin auto-mount.
- [x] Retirar páginas/layouts/componentes Astro/React y previews desconectadas, comprobando que no hay imports activos. No tocar Go/Rust.

## 3. Entrada principal y pruebas vigentes

- [x] Configurar SvelteKit/Vite/TypeScript convencional con entorno aislado `config/frontend`; scripts raíz frontend, scripts `api:*` para backend y workspace/dependencias separados en el lock.
- [x] Adaptar fixtures y pruebas de controladores/browser a componentes Svelte; conservar casos de seguridad, errores, transacciones de UI, foco/contraste/responsive y material de recuperación. Retirar solo verificaciones de UI eliminada/diagnósticos.
- [x] Ejecutar `npm run check`, `npm run build`, `npm test` y `npm run api:build`; confirmar que `tests/frontend-layout.test.mjs` pasa sin skips.

## 4. Docker, CI y documentación

- [x] Actualizar COPY/ignore de imagen y CI para frontend/shared/manifiestos, sin fuentes API; actualizar fixture Better Auth de tests a la nueva ruta.
- [x] Construir y ejecutar imagen CI; verificar entorno explícito y ausencia de fuentes/secretos del backend. Construir target `tiny` y ejecutar aceptación de imagen sobre la app real.
- [x] Actualizar README/guías y recibos. Verificar hashes protegidos, diff staged, ausencia de referencias activas legacy y whitespace. Dejar cambios sin commit/push.

## Recibos de esta reorganización

Las cifras anteriores al cambio de layout no se reutilizan como evidencia actual.

| Comprobación | Resultado actual |
| --- | --- |
| `bun install --frozen-lockfile --ignore-scripts` | Sin cambios; manifiestos/lock consistentes |
| `npm run check` | 0 errores y 0 advertencias |
| `npm run build` | Nueve rutas estáticas con hidratación en `.svelte-kit/static` |
| `npm test` | 109/109, sin skips; navegador, componentes, contratos, API Astro aislada y proxy real de bandeja |
| Contraste del login real | 108 estados, mínimos texto 4.96:1 y bordes 4.13:1 |
| `npm run api:build` | Éxito en `api/dist`; sin despliegue ni migración de datos |
| `python3 -m unittest discover -s tests/static_image` | 9/9 |
| `cargo test --locked --offline --manifest-path docker/launcher/Cargo.toml` | 5/5 (lanzador Docker, no candidato backend) |
| Imagen `auth-static:frontend-cleanup` | `sha256:16a6a543ccd8ae69a6412de18f247e74eb577573567b3f506a40fd6fae2cca72`, 13,810,282 bytes (~13.2 MiB) |
| `AUTH_STATIC_IMAGE=auth-static:frontend-cleanup AUTH_STATIC_FIXTURE=0 node --test --test-concurrency=1 tests/static-image*.test.mjs` | 9/9, sin skips: runtime real, codecs, HTTP/TLS, upstream A/B y navegador con Better Auth aislado |
| Build y ejecución de CI | Imagen construida y ejecutada sin red; check 0/0, build estático y 29/29 pruebas, sin skips |
| Aislamiento de CI | Sentinel del host y `API_UPSTREAM` no heredados; sin fuentes API/Go/Rust, `.env`, `.local-auth` ni `.git` |
| Baseline protegida | 43 archivos, HEAD y diff staged sin cambios |

Se conservó la cobertura HTTP útil que antes dependía de un servidor manual: `tests/local-http.test.mjs` arranca Astro con copias de API/shared y DB/secreto temporales, sin cargar el entorno del repositorio. Las pruebas de cuenta usan ahora componentes Svelte reales con límites de transporte/sesión controlados. La aceptación del bundle y de imagen usa Better Auth real aislado.

El build API conserva avisos del adaptador Cloudflare (binding `SESSION`, sharp y externalización de módulos Node); el build termina sin error. No se validaron despliegue Cloudflare, proveedores externos, cuentas productivas ni rendimiento.

La suite completa, el build frontend, ambas imágenes y la aceptación Docker se reejecutaron después de corregir el Host de la bandeja. Se mantiene `railway` en el workspace original, sin commit, push, publicación ni despliegue; el índice Git preexistente permanece intacto.

## Revisión y regresiones de integración

- Se preservó `api/public/.assetsignore` con las exclusiones originales `_worker.js` y `_routes.json`. La regresión estructural se observó RED antes de añadirlo; el rebuild API confirma que llega a `api/dist/.assetsignore`. El archivo no entra en el empaquetado Nginx.
- La revisión independiente detectó un P2 del recorrido local Vite → Astro: `changeOrigin: true` convertía el Host público en el loopback de transporte y la bandeja devolvía 404. La nueva prueba de integración lo reprodujo antes de corregir exclusivamente `/dev/inbox` a `changeOrigin: false`. `/api` conserva su comportamiento. Pasaron las siete pruebas focalizadas, incluyendo 200/no-store, rechazo de Host ajeno y prefijos exactos, sin relajar el guard del backend.
- La revisión acotada posterior confirmó que la corrección resuelve el P2, sin nuevos hallazgos en ese cambio. La revisión fue de código; la ejecución de pruebas corresponde a los recibos anteriores.
- Se compararon con `HEAD` los 17 endpoints y otros archivos trasladados: 27 archivos de API/DB/middleware/worker permanecen idénticos byte a byte. Los cambios de los otros helpers trasladados son imports hacia `shared`; no se reescribió la autenticación. Se conservó también el favicon original.
