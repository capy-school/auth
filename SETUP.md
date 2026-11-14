# Configuración de frontend y API

Para desarrollo sin cuentas ni servicios productivos, sigue [QUICKSTART](QUICKSTART.md). El frontend y la API se arrancan por separado; no copies secretos del backend al frontend.

## Entorno local existente

`npm run dev:setup` prepara explícitamente `.local-auth/auth.db`, un secreto local y `.env.development.local` en la raíz. Usa Better Auth real con magic-link y bandeja de desarrollo. No reemplaza archivos de entorno existentes ni debe usarse para preparar producción.

La API conserva esa ubicación aunque su código esté en `api/`: `api/astro.config.mjs` carga el entorno desde el directorio padre. El frontend solo descubre archivos de entorno en `config/frontend`, con prefijo público `PUBLIC_KIT_`. `npm run dev` activa la política local de SvelteKit sin leer el secreto local.

Si la configuración local existente tiene un origen diferente, ambos procesos deben usar el mismo origen público. El valor predeterminado es `http://auth.localhost`, compartido mediante Portless y el proxy Vite. Un error de modos/orígenes inconsistentes debe corregirse en la configuración, no relajando su validación.

## Backend no local

Conserva el entorno actual del backend. `.env.example` describe sus nombres; si ya tienes `.env`, **no lo sobrescribas**.

| Grupo | Configuración en el backend |
| --- | --- |
| Persistencia | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |
| Autenticación | `BETTER_AUTH_SECRET`, `AUTH_BASE_URL`, `BETTER_AUTH_URL` |
| Orígenes/cookies | Trusted origins, redirects SSO y dominio/atributos de cookies adecuados al origen público |
| Proveedores | Credenciales y callbacks de los proveedores realmente habilitados |
| Correo | `FORWARDEMAIL_KEY`, `SMTP_FROM`; [guía Forward Email](FORWARDEMAIL_SETUP.md) |
| Passkeys | `PASSKEY_RP_ID`, `PASSKEY_RP_NAME` y origen válido |

El origen público es el del frontend, no necesariamente la dirección de transporte de la API. El callback de un proveedor tiene la forma `https://<origen-publico>/api/auth/callback/<provider>`. Configúralo en la consola del proveedor correspondiente; construir la UI no habilita sus credenciales.

No se han actualizado Better Auth ni el esquema de datos como parte de esta migración. Los scripts de DB viven en el workspace API; su `--help` está disponible con `npm run --workspace @capy/auth-api db:generate -- --help`. Una migración real requiere revisar primero el entorno y el destino; no es un paso del build/check del frontend.

## Build y operación

```bash
npm run check
npm run build      # .svelte-kit/static: frontend sin servidor runtime
npm run api:build  # api/dist: backend Cloudflare existente, sin desplegar
```

Para operar la imagen estática, sigue [docs/static-image.md](docs/static-image.md). `API_UPSTREAM` se configura al arrancar Nginx y no sustituye la configuración de confianza/cookies del backend.

No borres `local.db`, `.local-auth` ni archivos de entorno para resolver un fallo. Comprueba primero origen público, transporte, cookies y logs. El build local no publica imágenes, no aplica migraciones y no despliega la API.
