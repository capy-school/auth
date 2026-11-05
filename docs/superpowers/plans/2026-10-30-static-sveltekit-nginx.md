# SvelteKit estático y Nginx scratch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Delegation is optional and requires the user's choice; do not spawn agents automatically. Steps use checkbox syntax for tracking.

**Goal:** Entregar el frontend real de Auth en HTML prerenderizado con hidratación/navegación SvelteKit, dentro de una imagen Nginx scratch que configure su proxy `/api` al arrancar.

**Architecture:** SvelteKit produce archivos públicos sin consultar una sesión durante el build. El navegador valida la sesión y conecta los controladores de cuenta existentes; la API Astro/legacy permanece separada y conserva la autorización. Un lanzador Rust estático valida el entorno, escribe la configuración en `/tmp` y ejecuta Nginx; no es un BFF ni sirve solicitudes.

**Tech Stack:** SvelteKit 2.70.3, Svelte 5.57.2, adapter-static 3.0.10, Vite 6.4.1, Better Auth 1.3.34, TypeScript, Node test/CDP Chrome existentes, Python estándar para assets/pruebas HTTP, Rust sin dependencias para el lanzador, Nginx 1.30.6 con TLS upstream y Docker multistage.

**Estado:** implementado y verificado localmente el 2026-10-31. Cambios sin commit en `railway`; no publicación ni despliegue. Recibos finales al final del documento.

---

## Reglas de ejecución

- Diseño aprobado: `docs/superpowers/specs/2026-10-29-static-nginx-image-design.md`; el usuario eligió **Completar SvelteKit**, no el perfil Astro propuesto inicialmente.
- Trabajar desde `railway` en `4fe9d610089dbe68eef2515b5df29df876567dad`. Los ocho commits de UI y su push ya terminaron; no repetirlos.
- No modificar `server/`, `server-rust/`, las nueve entradas Go previamente staged, credenciales, bases de datos ni configuraciones de producción. Registrar el hash de `git diff --cached --binary` antes/después.
- No hacer nuevos commits/push, publicar imagen, desplegar, iniciar servicios ajenos ni apagar el equipo sin autorización. Los checkpoints aquí son revisión de diffs y pruebas, no cambios de historia.
- Red/almacenamiento de pruebas aislados; perfiles Chrome temporales propios. No visitar cuentas reales ni APIs productivas al ejecutar aceptación.
- Docker responde con servidor 29.9.1. Eso no demuestra que la imagen exista: build y ejecución son requisitos separados.

## Mapa de unidades y archivos

| Unidad | Archivos | Responsabilidad |
| --- | --- | --- |
| Frontera cliente | `src/lib/auth-client.ts`, `src/kit/lib/auth/{policy,session,login}.ts` | Same-origin, política de destinos/local, sesión del navegador y operaciones de acceso. Ningún import de autenticación de servidor. |
| Rutas reales | `src/kit/routes/{+layout.ts,+layout.svelte,+page.svelte,dashboard/+page.svelte,logout/+page.svelte,settings/[section]/{+page.ts,+page.svelte}}` | Nueve páginas estáticas y navegación Kit; ningún `+page.server` ni endpoint de API. |
| UI A en Svelte | `src/kit/lib/portal/{LoginPortal,LoginForm,ProviderIcon}.svelte`, `src/kit/lib/account/{AccountShell,AccountPage,Dashboard,Icon,Feedback,Sessions,Passkeys,ApiKeys,TwoFactor,Organizations}.svelte` | Portar composición/marcado aprobado, no rediseñar. Reutilizar CSS existente. |
| Controladores compartidos | `src/components/account/{ui,sessions,passkeys,api-keys,two-factor,organizations}.ts`, `src/kit/lib/account/manager.ts` | Entradas explícitas e idempotentes por montaje, manteniendo compatibilidad Astro. |
| Diagnóstico separado | `src/kit/diagnostic-routes/`, `svelte.config.js`, pruebas Kit de presentación | Preservar previews bajo un modo diagnóstico explícito que no entre en la imagen. |
| Desarrollo | `vite.sveltekit.config.ts`, `scripts/kit-proxy.mjs`, `package.json` | Proxy exacto de `/api`, upstream solo de servidor y comandos local/backend separados. |
| Imagen | `Dockerfile`, `.dockerignore`, `docker/{assets.py,nginx.py,launcher/Cargo.toml,launcher/src/main.rs}` | Build estático, representaciones comprimidas, configuración y runtime scratch. |
| Aceptación | `tests/kit-app-*.test.*`, `tests/helpers/kit-static-fixture.mjs`, `tests/static-image.test.mjs`, `tests/fixtures/static-api.py`, `tests/static_image/` | HTML, flujo real del bundle, proxy HTTP/HTTPS y comportamiento de la imagen. |
| Operación | `docs/static-image.md`, secciones pertinentes de `README.md` | Comandos reproducibles, contrato con la API y límites verificados. |

## Task 1 — Frontera same-origin, sesión y destinos

**Files:** modificar `src/lib/auth-client.ts`; crear `src/kit/lib/auth/policy.ts`, `session.ts`, `login.ts`; crear `tests/kit-app-auth.test.ts`.

- [x] **1. Escribir primero las pruebas del contrato cliente.** Importar funciones puras y suministrar `fetch`/storage falsos: 401 significa sesión ausente, 5xx/red/JSON inválido significan error, datos válidos significan sesión autenticada. La validación no acepta `{ user: {} }`, no guarda cookies/tokens en storage y usa `credentials: 'include'`, `cache: 'no-store'`.

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSession } from '../src/kit/lib/auth/session';

test('401 no se convierte en una sesión ni en datos de ejemplo', async () => {
  const calls: Array<[unknown, RequestInit | undefined]> = [];
  const result = await readSession(async (url, init) => {
    calls.push([url, init]);
    return new Response(null, { status: 401 });
  });
  assert.deepEqual(result, { state: 'anonymous' });
  assert.equal(calls[0][0], '/api/session');
  assert.equal(calls[0][1]?.cache, 'no-store');
  assert.equal(calls[0][1]?.credentials, 'include');
});

test('un fallo de servidor no se trata como logout ni como éxito', async () => {
  await assert.rejects(() => readSession(async () => new Response(null, { status: 503 })));
});
```

- [x] **2. Ejecutar RED:** `node --import tsx --test tests/kit-app-auth.test.ts`; debe fallar por el módulo aún inexistente.
- [x] **3. Implementar los contratos:** `readSession(fetcher, signal?)` devuelve una unión `{ state: 'anonymous' } | { state: 'authenticated'; user: AccountUser }`; verifica un `user.id` no vacío y tipos básicos antes de utilizar datos. El cliente Better Auth usa `window.location.origin` en navegador y ninguna URL de backend pública compilada. No ejecutar llamadas al importar módulos.
- [x] **4. Implementar política/login con dependencias explícitas:** reutilizar registro de aplicaciones y funciones `postLoginDestination`, `magicLinkDestination`, `selectRedirect`; adaptar la política local mediante `PUBLIC_KIT_AUTH_LOCAL_MODE=1` solo en desarrollo y origen browser validado por `localPolicy`. No leer `.env` raíz ni persistir secretos. Probar `app`/`redirect` incompletos, desconocidos, con credenciales, origen ajeno y storage deshabilitado.
- [x] **5. Ejecutar GREEN:** pruebas nuevas y `node --import tsx --test tests/local-*.test.*`. Revisar `git diff --check` y confirmar que el diff staged Go no cambió.

## Task 2 — Rutas estáticas de producción y diagnóstico aislado

**Files:** modificar `svelte.config.js`, `vite.sveltekit.config.ts`, `package.json`, `tests/kit-config.test.mjs`; mover las previews existentes a `src/kit/diagnostic-routes/` conservando contenido y pruebas; crear rutas reales y `tests/kit-app-build.test.mjs`.

- [x] **1. Escribir pruebas que exijan los nueve HTML públicos** en `.svelte-kit/static`: `/`, `/dashboard`, `/logout`, `/settings/security`, `/settings/sessions`, `/settings/passkey`, `/settings/2fa`, `/settings/api-keys`, `/settings/organizations`. Exigir ausencia de `__migration`, endpoints API, John Doe y datos de sesión en la salida de producción.
- [x] **2. Ejecutar RED** con las pruebas nuevas sobre `npm run kit:build`; inicialmente faltaban las páginas reales.
- [x] **3. Mantener el layout raíz ya correcto**:

```ts
export const prerender = true;
export const ssr = true;
export const csr = true;
export const trailingSlash = 'always';
```

`ssr` aquí sirve únicamente al prerender de build. No añadir adaptador de servidor, fallback global ni funciones servidor para obtener una sesión.

- [x] **4. Añadir las entradas de ajustes** con `entries` en `settings/[section]/+page.ts`:

```ts
import { error } from '@sveltejs/kit';

const sections = ['security', 'sessions', 'passkey', '2fa', 'api-keys', 'organizations'] as const;
export const entries = () => sections.map(section => ({ section }));
export const load = ({ params }: { params: { section: string } }) => {
  const section = sections.find(value => value === params.section);
  if (!section) error(404, 'Ajuste no encontrado');
  return { section };
};
```

- [x] **5. Separar el árbol diagnóstico** con `KIT_DIAGNOSTICS=1` en configuración/scripts explícitos; producción es el modo predeterminado. Conservar `envDir: 'src/kit'`, prefijos y deny rules. Actualizar las expectativas históricas de «solo previews, sin fetch» por comprobaciones positivas de frontend real y ausencia de imports de servidor/secretos. No ampliar la allowlist a toda la raíz o todo `src/lib`.
- [x] **6. Ejecutar GREEN:** `npm run kit:check`, `npm run kit:build` y las pruebas de configuración/build. Ejecutar también el build diagnóstico y sus pruebas de presentación. Mantener los comandos Astro operacionales actuales.

## Task 3 — Port del login A y autenticación real

**Files:** crear componentes `src/kit/lib/portal/`, `src/kit/routes/+page.svelte`; crear `tests/kit-app-login.test.mjs`, `tests/helpers/kit-static-fixture.mjs`; reutilizar `src/styles/login.css` y el helper Chrome existente.

- [x] **1. Escribir aceptación sobre el bundle Kit real**, no un componente con callbacks de demostración: render estático, hidratación, correo, seis proveedores, passkey, callbacks y políticas de destino. El fixture sirve los archivos del build y una API aislada; no reemplaza el cliente Better Auth por un objeto que inventa éxito.
- [x] **2. Ejecutar RED:** exigir `.login-page`, `.portal-art`, `.portal-login`, los seis `data-provider`, formulario POST y campos/botones nativamente disabled antes de hidratar. Con JavaScript deshabilitado, rellenar correo no debe generar solicitudes GET ni exponerlo en la URL.
- [x] **3. Portar exactamente el marcado aprobado** de `src/components/login/LoginPortal.astro`, `src/components/LoginGateway.tsx` y `src/components/AuthButton.tsx`. Conservar geometría SVG, textos, clases, IDs, colores de proveedores, roles y nombres accesibles. Usar snippets y eventos Svelte 5 en lugar de slots/handlers React; no reutilizar la vieja preview como si estuviera conectada.
- [x] **4. Conectar los handlers** a Task 1 después de `onMount` y validar la query antes de habilitar controles. Mantener OAuth nativo frente a genérico, callbacks de alta/error, autofill passkey solo cuando es compatible, correo por magic-link, OTP sin configurar deshabilitado y la bandeja local de desarrollo. El modo local muestra proveedores pero nunca permite su clic.
- [x] **5. Ejecutar GREEN** con llamadas de la API falsa registradas en servidor: comprobar métodos, payload y callbacks. Probar app inválida, redirect ajeno, login ya autenticado, fallo de red, vuelta desde magic-link y storage bloqueado. Repetir las comprobaciones de contraste del diseño A y obtener capturas desktop/móvil del bundle real.

## Task 4 — Cuenta hidratada y controladores reutilizables

**Files:** crear componentes `src/kit/lib/account/` y `manager.ts`; modificar únicamente las entradas de montaje en los controladores compartidos; completar rutas `dashboard`, `settings/[section]`, `logout`; crear `tests/kit-app-account.test.mjs`.

- [x] **1. Escribir pruebas de HTML genérico y bootstrap**: hay headings/navegación prerenderizados, no hay nombre/correo/rol personal ni fixture localhost; los managers no consultan ni mutan API hasta confirmar sesión. Probar 401, 503, respuesta malformada, reintento y sesión válida.
- [x] **2. Ejecutar RED:** visitar el build real en Chrome con la API aislada, no las páginas Astro.
- [x] **3. Portar marcado con este mapeo completo**:

| Fuente aprobada | Destino Svelte |
| --- | --- |
| `src/components/account/AccountShell.astro` | `$lib/account/AccountShell.svelte` |
| `src/components/dashboard/Dashboard.astro` | `$lib/account/Dashboard.svelte` |
| `src/components/dashboard/Icon.astro` | `$lib/account/Icon.svelte` |
| `src/components/account/AccountPage.astro` | `$lib/account/AccountPage.svelte` |
| `src/components/account/Feedback.astro` | `$lib/account/Feedback.svelte` |
| `src/components/account/Sessions.astro` | `$lib/account/Sessions.svelte` |
| `src/components/account/Passkeys.astro` | `$lib/account/Passkeys.svelte` |
| `src/components/account/ApiKeys.astro` | `$lib/account/ApiKeys.svelte` |
| `src/components/account/TwoFactor.astro` | `$lib/account/TwoFactor.svelte` |
| `src/components/account/Organizations.astro` | `$lib/account/Organizations.svelte` |

Conservar selectores `data-*`, fieldsets disabled, paneles de secretos ocultos, foco y etiquetas que consumen los controladores. Reutilizar `src/styles/dashboard.css` sin un rediseño.

- [x] **4. Separar montaje de inicialización:** cada módulo compartido exporta una entrada explícita e idempotente (`mountSessions`, `mountPasskeys`, `mountApiKeys`, `mountTwoFactor`, `mountOrganizations`) y conserva la llamada automática que necesitan los scripts Astro existentes. Kit las importa únicamente al autorizar la vista y las llama en cada montaje, no solo la primera importación. Un action de Svelte cancela el montaje diferido si la vista se destruye. No insertar datos de usuario con `innerHTML`.
- [x] **5. Conectar AccountShell a `readSession`** en navegador. Mostrar carga/error y reintento fuera de la zona protegida; esta permanece oculta/inert hasta éxito. Iniciales, avatar, correo verificado y referencia administrativa provienen de la sesión real. Revalidar al entrar en otra vista, sin cache de PII ni módulos globales que guarden usuarios entre renders.
- [x] **6. Implementar logout** con `authClient.signOut()` desde navegador, botón/reintento y vuelta a `/` solo después de éxito. No fingir el cierre con una redirección estática.
- [x] **7. Ejecutar GREEN:** navegar dos veces a cada manager mediante enlaces Kit y confirmar una sola mutación por acción, sin reload de documento. Repetir sesiones, altas/renombres/bajas de passkey, mostrar/copiar/descartar clave, verificación TOTP y retención de recovery codes, roles/miembros/invitaciones. Ejecutar además las regresiones Astro/browser/contratos existentes.

## Task 5 — Proxy local y contrato con la API

**Files:** crear `scripts/kit-proxy.mjs`, `tests/kit-app-proxy.test.mjs`; modificar `vite.sveltekit.config.ts`, `package.json`.

- [x] **1. Escribir pruebas del proxy** con dos servidores loopback aislados: `/api` y `/api/*` preservan método, cuerpo, cookies, query y estado; `/apix` no es API; 401 no se convierte en HTML. La comprobación del bundle sin `API_UPSTREAM` queda en el checkpoint del build completo.
- [x] **2. Ejecutar RED**, después implementar una regla Vite `^/api(?:[/?]|$)` sin `rewrite`, con validación HTTP/HTTPS del target, TLS verificado y fallback local `http://127.0.0.1:4321`. `API_UPSTREAM` se lee solo en configuración de servidor, no desde código cliente. Vite compara la URL con query; su CORS se desactiva para no consumir OPTIONS antes de la API.
- [x] **3. Añadir comandos separados** para backend loopback y frontend Portless, conservando `dev` y scripts existentes de Astro. La bandeja local se proxifica solo en desarrollo y solo con modo local explícito; no entra en la imagen.
- [x] **4. Ejecutar GREEN:** comprobar headers, cookies host-only y callbacks públicos con una instancia Better Auth local de pruebas. Documentar que el backend debe conocer el origen público y sus trusted origins/cookie domain; cambiar `API_UPSTREAM` no sustituye esa configuración ni reescribe cookies arbitrariamente.

## Task 6 — Assets precomprimidos y configuración Nginx

**Files:** crear `docker/assets.py`, `docker/nginx.py`, `tests/static_image/test_assets.py`, `test_config.py`.

- [x] **1. Escribir pruebas de round-trip** Brotli, Zstd, gzip y deflate zlib; MIME, HEAD, ETag/304, `Vary: Accept-Encoding`, `q=0`, identity prohibida, wildcard, archivos faltantes y HTML/rutas profundas. Los compresores se ejecutan en build, nunca por solicitud.
- [x] **2. Ejecutar RED:** `python3 -m unittest discover -s tests/static_image -v`.
- [x] **3. Adaptar el algoritmo del benchmark privado**, no sus fixtures: copiar los archivos de salida Kit, comprimir representaciones y generar reglas para los archivos realmente presentes. Mantener prioridad del servidor entre encodings aceptables; un `q=0` excluye siempre ese encoding. Nunca devolver bytes identity con header de compresión ni servir sidecars internos como una página.
- [x] **4. Generar configuración que separe API de estáticos**: `/api` y `/api/*` van exclusivamente al proxy, sin caché ni interceptación de errores. `proxy_pass` conserva `$request_uri`; DNS se resuelve en ejecución para permitir arrancar aunque el backend duerma. HTTPS activa SNI y verificación CA. HTML revalida; `_app/immutable/` tiene caché larga. Recurso desconocido devuelve 404, no login con 200. Añadir salud estática independiente.
- [x] **5. Ejecutar GREEN** y revisar la plantilla con variables Nginx intactas. Los únicos marcadores a sustituir por el lanzador deben ser explícitos, no un `envsubst` global sobre `$uri`/`$request_uri`.

## Task 7 — Lanzador estático y Dockerfile scratch

**Files:** crear `docker/launcher/{Cargo.toml,Cargo.lock,src/main.rs}`, `Dockerfile`, `.dockerignore`; añadir pruebas unitarias Rust en el módulo del lanzador.

- [x] **1. Escribir tests Rust antes de implementación** para upstream ausente, protocolo no permitido, credenciales, rutas/query/fragmento, whitespace/directivas inyectadas, DNS/IPv4/IPv6, puerto inválido y resolvers IPv4/IPv6 de `/etc/resolv.conf`. El target es un origen, nunca una plantilla de configuración arbitraria.
- [x] **2. Ejecutar RED:** `cargo test --manifest-path docker/launcher/Cargo.toml`.
- [x] **3. Implementar el lanzador solo con std**: validar `API_UPSTREAM` y `PORT` (8080 predeterminado); leer resolvers; escribir `/tmp/nginx.conf`; `CommandExt::exec` de `/nginx -c /tmp/nginx.conf -g 'daemon off;'`. No abrir sockets HTTP ni crear Tokio/Ohkami: no hay una necesidad de BFF.
- [x] **4. Fijar las imágenes/sources a digests comprobados**. Usar el Alpine pin y el SHA Nginx 1.30.6 del benchmark; inspeccionar el digest real de `oven/bun:1.3.14-alpine` antes de escribir el `FROM` fijado. El build del lanzador utiliza Rust/Cargo de la etapa Alpine y no descarga crates.
- [x] **5. Crear etapas independientes** de dependencias/frontend, compresión/config, compilación Nginx con OpenSSL estático, compilación launcher y final scratch. Final: `/nginx`, `/launcher`, `/srv`, CA, MIME y licencias. `USER 101:101`, `ENTRYPOINT ["/launcher"]`; todas las rutas escribibles quedan bajo `/tmp`. Comprobar que los binarios no tienen intérprete dinámico.
- [x] **6. Crear `.dockerignore` con allowlist del build** y exclusiones explícitas de `.env*`, `.git`, bases de datos, outputs, pruebas privadas/backend y árboles Go/Rust ajenos. Preferir `COPY` selectivos; no `COPY . .` como atajo para enviar secretos.
- [x] **7. Ejecutar GREEN:** pruebas Rust, `docker build --target tiny -t auth-static:local .`, inspección de configuración/rootfs y `nginx -t` a través del lanzador. No afirmar tamaño o rendimiento antes de medir el image ID construido.

## Task 8 — Aceptación de la misma imagen con upstreams distintos

**Files:** crear `tests/static-image.test.mjs`, `tests/fixtures/static-api.py`, `docs/static-image.md`; actualizar README y recibos de este plan.

- [x] **1. Crear la API de prueba aislada** con respuesta identificable por instancia, echo de método/path/query/body/cookie, múltiples `Set-Cookie`, 401/4xx/5xx y variante HTTPS con CA efímera. Un target Docker exclusivo de pruebas puede incluir Python/OpenSSL; no se copia a `tiny`.
- [x] **2. Ejecutar la imagen** en red Docker propia, con `--read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL --security-opt no-new-privileges`, puertos solo loopback y usuario de imagen no-root. Montar únicamente CA de test cuando se pruebe HTTPS. Limpiar solo contenedores/red/archivos creados por ese test.
- [x] **3. Probar que un mismo image ID** responde mediante upstream A y luego B cambiando solamente `API_UPSTREAM`; repetir con `PORT` no predeterminado. Backend ausente no impide servir portada/salud; una petición API fallida no se transforma en HTML.
- [x] **4. Verificar HTTP/HTTPS real**: prefix/query exactos, POST/PUT/PATCH/DELETE/OPTIONS/HEAD, cuerpos, cookies repetidas, estados y contenido; certificado válido funciona y CA/nombre incorrectos fallan cerrados. No `proxy_ssl_verify off` ni `secure: false`.
- [x] **5. Verificar frontend real de la imagen**: rutas profundas, hidratación, perfil, navegación SPA ida/vuelta, logout y ausencia de excepciones; compresión round-trip y validadores para HTML/JS/CSS. Comprobar ausencia de shell, Node, secretos, previews y código de backend en rootfs final.
- [x] **6. Ejecutar regresión final y documentar recibos**:

```bash
npm run kit:check
npm run kit:build
node --import tsx --test --test-concurrency=1 tests/kit-app-*.test.* tests/kit-config.test.mjs tests/account-*.test.* tests/dashboard*.test.* tests/login*.test.* tests/local-auth.test.mjs tests/local-config.test.mjs tests/local-integration.test.ts tests/kit-login.test.mjs tests/kit-passkeys.test.mjs tests/kit-api-key-dialog.test.mjs tests/kit-api-keys.test.mjs
npm run build
python3 -m unittest discover -s tests/static_image -v
cargo test --manifest-path docker/launcher/Cargo.toml --locked --offline
docker build --target tiny -t auth-static:local .
npm run image:test
git diff --check
```

Registrar tests realmente ejecutados, skips/fallos, image ID/tamaño y comandos de arranque con `API_UPSTREAM`/`PORT`. No confundir un build verde con aceptación del contenedor ni usar resultados históricos de las 132 pruebas como evidencia nueva.

- [x] **7. Documentar operación:** comando Docker no-root/read-only, origen público/trusted origins/cookies que necesita el backend, modo local, troubleshooting de DNS/TLS y restauración del frontend legacy sin borrar fuentes. Confirmar diff staged Go idéntico al inicial. Entregar cambios sin nuevos commits/push/despliegue.

## Checkpoints de revisión

1. Tasks 1–2: contratos, aislamiento y build sin PII.
2. Tasks 3–5: UI A y operaciones reales sobre el bundle Kit; regresiones legacy.
3. Tasks 6–8: imagen construida y pruebas reales de forwarding, TLS, compresión y cambio de upstream sin rebuild.

Si una prueba revela una incompatibilidad de autenticación, diagnosticar el contrato existente antes de añadir un BFF o reescribir el backend. Una necesidad real de BFF vuelve al usuario y usa Ohkami + Tokio.

## Recibos parciales históricos

- Baseline previo: 135 pruebas de la batería general pasaron y dos HTTP locales se omitieron por falta de instancia opt-in; nueve checks de diagnóstico requieren `KIT_SMOKE_URL` y pasaron al ejecutarlos con un servidor Vite aislado. Total baseline comprobado: 144 pass, dos skips documentados.
- `node --import tsx --test --test-concurrency=1 tests/kit-app-proxy.test.mjs tests/kit-app-fixture.test.mjs`: cuatro pruebas pasan. RED previo: módulos ausentes y OPTIONS interceptado con 204; GREEN tras implementar el proxy/factory y el fixture Better Auth real.
- `tests/kit-app-browser.test.mjs` se escribió antes de generar el frontend real: RED por ausencia de `.svelte-kit/static/index.html`. No es todavía un recibo de aceptación del frontend.
- Hash del diff staged y 42 archivos protegidos de Go/Rust/docs comprobados idénticos después de los cambios del padre. Baseline guardado fuera del repo en `/tmp/opencode/auth-static-baseline/state.json`.
- En ese checkpoint faltaban el build y la integración Docker final; las pruebas parciales no se utilizaron como prueba de entrega. Los recibos finales siguientes sí corresponden a la aplicación completa.

## Recibos finales — 2026-10-31

| Comprobación | Resultado observado |
| --- | --- |
| `npm run kit:check` | 0 errores y 0 warnings; se conserva el advisory de tsconfig raíz Astro. |
| `npm run kit:build` | 9 rutas prerenderizadas, hidratación y router cliente, sin API/diagnóstico/PII. |
| `npm run build` | Build legacy Astro/Cloudflare correcto; conserva sus avisos anteriores de sharp y módulos Node externalizados. No es el runtime de la imagen. |
| Batería explícita del bloque anterior | **189 pass, 0 fail, 0 skip**, después de los fixes finales de callbacks y entorno local. |
| Diagnóstico, ejecutado por separado | Build correcto; **3 pruebas de artefactos** y **9 smoke HTTP** con servidor propio y `KIT_SMOKE_URL`. Después se restauró el build de producción. |
| Python `tests/static_image` | **9 pass**, sin skips. |
| Lanzador Rust offline/locked | **5 pass**, sin dependencias externas. |
| `docker build --target tiny -t auth-static:local .` | Imagen real completa construida, no la fixture de runtime. |
| `npm run image:test` | **9 pass, 0 fail, 0 skip**: 8 checks de runtime/proxy y un recorrido Chrome con Better Auth real detrás de Nginx. |

Imagen final comprobada: `auth-static:local`, ID **`sha256:7e199a067b1b0d64d548d44f79d08462e63d731f4231402974afc4b3dcbc6e6f`**, **13,858,584 bytes (~13.2 MiB)** en este entorno. No es una afirmación de tamaño óptimo global ni una medición de capacidad/cold start.

La aceptación Docker prueba el mismo ID con upstream A/B y `PORT` distinto, procesos no-root/read-only, backend dormido, rutas profundas y 404, métodos/cuerpos/query/cookies/estados, cuatro formatos de compresión, MIME/HEAD/validadores y TLS con CA/nombre correctos e incorrectos. El recorrido Chrome real verifica magic-link, cookie firmada, perfil, clave de API, navegación SPA, logout y ausencia de excepciones. La API Better Auth de prueba se construye en un contexto temporal separado y nunca entra en `tiny`.

La UI Kit pasa **108 combinaciones de contraste** (normal/hover/focus/pressed, 1440/390/320 px): mínimo texto **4.96:1**, borde **4.13:1**; también se ejecuta la auditoría sobre los assets de la propia imagen. Capturas revisadas: `/tmp/opencode/auth-kit-login-captures-GHfmxY/{1440,320}.png`; la batería final produjo otro juego en `/tmp/opencode/auth-kit-login-captures-ZfnYkJ/`.

### Correcciones encontradas al integrar

- Vite consumía OPTIONS con su CORS antes del proxy: la API conserva ahora el preflight. El match incluye `/api?query`, no `/apix`; el modo diagnóstico nunca tiene proxy.
- Kit `publicPrefix` no configura por sí solo `import.meta.env` de Vite: se fijó también `envPrefix: 'PUBLIC_KIT_'`. La prueba live de modo local confirma seis proveedores visibles pero nativamente disabled, correo habilitado y bandeja local, sin passkey/OTP ni mutaciones sociales.
- `public/.assetsignore` rompía el empaquetado real, aunque no las fixtures. Se excluye del contexto sin relajar el rechazo de archivos ocultos/secretos.
- Las continuaciones same-origin con ruta `//host` podían convertirse en referencias de red y salir del origen. Se conserva su URL absoluta, con regresión específica; las rutas normales siguen iguales.
- La API de test con el libsql legacy no carga su addon bajo Bun/musl (`fcntl64`). Solo ese backend de prueba usa Bun/glibc fijado; el frontend y runtime final siguen siendo estáticos/scratch.

No se utilizaron proveedores OAuth externos ni cuentas productivas para aceptación. Los dos smoke opt-in HTTP del entorno local antiguo no se ejecutaron en la batería final; no se presentaron como pruebas pasadas. Sus contratos se cubren además con instancias Better Auth temporales y el nuevo recorrido real.

Protección del trabajo previo: 42 archivos Go/Rust/docs y el SHA-256 completo del diff staged permanecen idénticos al baseline (`7372e7f7f17a0941c11108774eec3a1ff84c44960e8d391561d4665d2000056f`). `HEAD` permanece en `4fe9d61`. No commits, push, despliegue, publicación ni cambios de credenciales/BD del usuario.
