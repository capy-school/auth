# Auth estático: SvelteKit + Nginx

La imagen sirve HTML generado durante el build, lo hidrata como SPA y envía las solicitudes `/api` a un backend externo. No ejecuta Node, Astro, SvelteKit SSR ni un BFF. El mismo image ID puede utilizar distintos backends sin recompilar JavaScript.

## Construir y arrancar

```bash
npm run image:build
docker run --rm --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1:8080:8080 \
  -e API_UPSTREAM="${API_UPSTREAM:?Define el origen HTTP o HTTPS de la API}" \
  auth-static:local
```

Abre `http://localhost:8080`. `API_UPSTREAM` debe apuntar al **backend**, no al propio servicio Nginx: usar como upstream el dominio que vuelve a este contenedor crearía un bucle.

| Variable de arranque | Uso |
| --- | --- |
| `API_UPSTREAM` | Obligatoria. Origen HTTP/HTTPS, con puerto opcional; sin credenciales, ruta, consulta ni fragmento. Se conserva el prefijo `/api`. |
| `PORT` | Puerto de escucha; 8080 por defecto. Si lo cambias, cambia también el puerto del contenedor en `-p`. |

No se carga un `.env` en el contenedor. Los secretos, la base de datos y la configuración de autenticación pertenecen al backend, no al build del frontend. Los flags públicos de Kit son solo de desarrollo; el destino de la API no es uno de ellos.

El puerto del contenedor sirve HTTP. En Railway, el ingreso público termina TLS; el origen público del backend debe reflejar esa URL HTTPS. El soporte TLS de esta imagen protege la conexión **hacia el upstream**, no configura por sí solo un certificado del dominio público.

## Contrato con el backend

- El navegador solicita `/api/session` y `/api/auth/*` en el origen público actual. Nginx conserva métodos, cuerpos, cookies, consulta y respuestas de error; no transforma un 401 en una página HTML.
- El backend sigue siendo responsable de autorización, CSRF, pertenencia a organizaciones y permisos de cada operación. Ocultar controles en el cliente no sustituye estas comprobaciones.
- Configura en el backend su **origen público de Auth**, trusted origins y dominio/atributos de cookies. El target de transporte puede ser distinto. Cambiar `API_UPSTREAM` no cambia esa configuración ni reescribe cookies arbitrariamente.
- Los callbacks deben volver al origen público del frontend o a destinos registrados. El proxy no habilita proveedores ni funcionalidades ausentes en la API.
- Un upstream HTTPS debe tener un certificado válido para su nombre y una cadena de confianza aceptada por la imagen. No se desactiva la verificación para resolver errores de TLS. Para una CA privada hay que suministrar un bundle de confianza adecuado.
- En Docker, `localhost` apunta al propio contenedor. Usa un nombre de servicio de su red o una dirección realmente accesible desde él. Un servidor ligado solo al loopback del host no es accesible por añadir un alias de host.

## Desarrollo con la API existente

En dos terminales, después de haber preparado el entorno local de Auth:

```bash
# API Astro existente, en loopback. Conserva su configuración y base locales.
npm run dev:api
```

```bash
# Frontend SvelteKit en el origen Portless auth.localhost.
npm run kit:dev:local
```

El proxy de desarrollo utiliza `http://127.0.0.1:4321` por defecto. Puedes cambiar **solo el transporte del servidor de desarrollo**:

```bash
API_UPSTREAM=http://127.0.0.1:4322 npm run kit:dev:local
```

La API debe seguir configurada para el origen público que muestra Portless. El modo local es opt-in y de desarrollo: los botones sociales son visibles pero están nativamente deshabilitados, el correo usa magic-link y la bandeja local se abre a través del proxy de desarrollo. La bandeja no se incluye en la imagen.

`npm run kit:dev` permite desarrollar el frontend sin activar la política local. Los comandos Astro anteriores se conservan; no registres simultáneamente dos frontends distintos como `auth` en Portless.

## Prerender y diagnóstico

```bash
npm run kit:check
npm run kit:build
```

La salida pública está en `.svelte-kit/static`. Se generan login, dashboard, logout y los seis ajustes, sin datos personales ni sesiones. `ssr = true` permite producir ese HTML **durante el build**; `adapter-static` no distribuye un servidor de renderizado.

Las previews anteriores permanecen en un árbol separado y opt-in:

```bash
npm run kit:diagnostic:dev
npm run kit:diagnostic:build
```

El build diagnóstico no es un frontend de autenticación ni debe utilizarse para construir/publicar la imagen de aplicación. Tras usarlo, ejecuta otra vez `npm run kit:build` antes de probar los archivos de producción.

## Verificar sin cuentas reales

Para estas pruebas se necesitan Docker/BuildKit, dependencias del proyecto, Node y Chrome (`DASHBOARD_CHROME_BIN` permite elegir el ejecutable), además de `zstd` en el host para decodificar esa representación. Python y Cargo permiten ejecutar por separado los tests de compresión/configuración y del lanzador.

```bash
npm run kit:build
npm run test:kit:app
npm run image:build
npm run image:test
```

La aceptación del bundle utiliza un host de archivos y una instancia Better Auth con base de datos temporal propia. La aceptación Docker crea una red y APIs de prueba independientes. No necesita credenciales ni sesiones productivas.

`image:test` construye primero la fixture HTTP/TLS y también ejecuta Chrome contra la imagen real y una API Better Auth aislada. Esta última usa un contexto de build temporal separado; no añade código de backend a la imagen de aplicación. Puede descargar su imagen de test y dependencias la primera vez.

### Resultado local verificado

`auth-static:local` se construyó y ejecutó con ID `sha256:7e199a067b1b0d64d548d44f79d08462e63d731f4231402974afc4b3dcbc6e6f`: **13,858,584 bytes (~13.2 MiB)**. Pasaron **189 pruebas de frontend/legacy**, **9 de imagen**, **9 de Python** y **5 de Rust**; el diagnóstico separado pasó otras 12. El recorrido de imagen utiliza cookies y magic-links reales de prueba, y mide 108 estados de contraste sobre sus assets. No son cifras de capacidad ni cold start.

Las pruebas de diagnóstico HTTP requieren su servidor y `KIT_SMOKE_URL`; no deben mezclarse con las pruebas unitarias sin ese contexto. Los recibos de ejecución y las limitaciones pendientes se registran en el [plan de implementación](superpowers/plans/2026-10-30-static-sveltekit-nginx.md).

## Si algo falla

| Síntoma | Qué comprobar |
| --- | --- |
| Arranque rechaza variables | El upstream debe ser un origen, no una URL con `/api` añadido; `PORT` debe ser válido. |
| HTML funciona, API devuelve 502 | DNS/red del contenedor, servicio backend despierto, puerto y TLS. Servir estáticos no requiere que la API ya esté lista. |
| Magic-link o proveedor rechaza el callback | Origen público y trusted origins del backend; aplicación y destino registrados. |
| Inicio de sesión no persiste | Host/dominio, `Secure`/SameSite y ruta de las cookies; usar el mismo origen público para acceder y volver del callback. |
| API recibe otro método o una ruta recortada | No añadir una redirección del navegador ni eliminar `/api` en un proxy adicional. |
| Se ve una preview desconectada | Se utilizó el modo diagnóstico. Construir la aplicación con `npm run kit:build`. |

Construir y probar localmente no publica imágenes ni despliega Railway. No se han medido capacidad, cold start ni rendimiento por el hecho de que el build termine.
