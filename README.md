# Login Gateway

Frontend **SvelteKit 2 / Svelte 5** estático con la interfaz A. La API actual de **Astro + Better Auth 1.3.34** vive en un workspace separado. El BFF y los servicios que la reemplacen quedan para otra iteración.

Login, dashboard, logout y seis ajustes se prerenderizan y luego se hidratan con navegación SPA. El HTML público no contiene datos de cuenta: el navegador consulta sesión y opera contra `/api` en su mismo origen. La API conserva la autorización, cookies, SSO y persistencia.

## Desarrollo local

Requisitos: Node 22.12+ (CI usa Node 24), Bun 1.3.14 y Portless disponible para `npm run dev`. Chrome es necesario para las pruebas de navegador.

```bash
bun install --frozen-lockfile --ignore-scripts
# Solo la primera vez, para preparar explícitamente tu entorno local:
npm run dev:setup
```

El setup crea `.local-auth/` y `.env.development.local` en la raíz, con almacenamiento y secreto locales. No lo ejecutes contra datos de producción. Si ya tienes entorno local preparado, no necesitas repetirlo.

Arranca en dos terminales:

```bash
npm run api:dev  # Astro en 127.0.0.1:4321; no sirve el frontend
```

```bash
npm run dev      # SvelteKit mediante Portless: http://auth.localhost
```

El proxy Vite envía `/api` al backend de loopback y, solo en desarrollo local, `/dev/inbox`. Los proveedores sociales permanecen visibles pero deshabilitados en este modo; el magic-link llega a la bandeja local. Para desarrollar sin esa política ni Portless, usa `npm run kit:dev`.

`API_UPSTREAM=http://127.0.0.1:4322 npm run dev` cambia el transporte, no el origen público ni las cookies de la API. Consulta el [contrato de backend y la guía de imagen](docs/static-image.md).

## Estructura

```text
src/
  routes/                  # Únicas páginas del frontend
  lib/portal/              # Login Svelte
  lib/account/             # Cuenta y controladores montados explícitamente
  lib/auth/                # Sesión y política de login
  lib/auth-client.ts       # SDK del navegador, same-origin
  styles/
static/                    # Assets públicos
shared/                    # Registro de apps y política de destinos, sin entorno/I/O
api/
  src/pages/api/           # Endpoints Astro actuales
  src/pages/dev/inbox.astro
  src/lib/                 # Better Auth y adaptadores de servidor
  src/db/                  # Persistencia actual
  public/.assetsignore     # Excluye código Worker de los assets Cloudflare
  astro.config.mjs
  wrangler.jsonc
docker/                    # Nginx scratch y CI
```

`server/` y `server-rust/` son candidatos fuera del alcance de esta migración; no forman parte del frontend ni de su imagen. Se retiraron la UI Astro/React duplicada y las previews desconectadas `__migration`.

## Comandos

| Comando | Resultado |
| --- | --- |
| `npm run dev` | Frontend local con Portless |
| `npm run check` | Tipos y diagnósticos Svelte |
| `npm run build` | Nueve rutas en `.svelte-kit/static/`, sin servidor runtime |
| `npm run preview` | Inspección del build; no sustituye al proxy de producción |
| `npm test` | Contratos, componentes, navegador y API local aislada |
| `npm run test:local` | Política local y contratos de API con almacenamiento temporal |
| `npm run api:dev` | Backend actual en loopback |
| `npm run api:build` | Artefacto Cloudflare en `api/dist/`; no despliega |
| `npm run image:build` | Imagen `auth-static:local` |
| `npm run image:test` | Aceptación HTTP/TLS y navegador sobre la imagen real |

Los aliases `kit:check`, `kit:build`, `kit:dev:local` y `test:kit:app` siguen disponibles. Los comandos operativos de la API son explícitos (`api:preview`, `api:cf:types`, `api:deploy`). No ejecutar `api:deploy` como parte de una validación local.

## Configuración y límites de seguridad

- **Frontend:** SvelteKit y Vite descubren entorno únicamente en `config/frontend`, con prefijo público `PUBLIC_KIT_`. No pongas secretos allí ni bajo `static/`. En producción, `API_UPSTREAM` se lee al arrancar Nginx, no se compila en JavaScript.
- **Backend:** conserva sus archivos de entorno en la raíz. `api/astro.config.mjs` apunta explícitamente allí. Base de datos, secretos, proveedores, trusted origins y cookies siguen siendo responsabilidad de la API; no se migran ni reinicializan al construir el frontend.
- **Autorización:** el cliente solo habilita los controles tras validar sesión. No reemplaza la comprobación de permisos en cada endpoint.

## Imagen y CI

Nginx sirve la aplicación desde `scratch`, sin Node ni SSR por solicitud. `API_UPSTREAM` es obligatorio; `PORT` vale 8080 por defecto. Las imágenes frontend/CI no copian fuentes de API ni archivos de entorno; solo necesitan su manifiesto para resolver el workspace (CI también incluye su configuración TypeScript).

```bash
docker build -f docker/ci/Dockerfile -t auth-ci:local .
docker run --rm --cap-drop ALL --security-opt no-new-privileges \
  --network none -e CI=true -e TZ=UTC auth-ci:local
```

El workflow `.github/workflows/ci.yml` ejecuta ese chequeo ligero en pushes a `railway`, PRs y ejecución manual. No recibe secretos de aplicación, no hereda variables del host y no publica imágenes ni despliega.

Para construir y probar el runtime necesitas Docker/BuildKit, Chrome y `zstd`. Las pruebas usan cuentas, bases y redes temporales propias; nunca requieren credenciales productivas. Más detalles en [docs/static-image.md](docs/static-image.md).
