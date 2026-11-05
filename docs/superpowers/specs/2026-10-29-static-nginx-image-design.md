# Auth estático: prerender, SPA y Nginx scratch

**Estado:** implementado y verificado localmente en SvelteKit estático, conservando la UI A. Imagen `auth-static:local` construida y ejecutada; recibos en `docs/superpowers/plans/2026-10-30-static-sveltekit-nginx.md`. Sin publicación ni despliegue.

El frontend conserva el login A y el área de cuenta actuales. El build produce HTML genérico y assets estáticos. El navegador hidrata las vistas, monta la navegación SPA y consulta la sesión y los datos por `/api`. No hay SSR por petición ni Node en la imagen final.

## Decisiones confirmadas

- Runtime mínimo `scratch`, siguiendo el experimento privado `capy-school/nginx-static-bench`.
- Dashboard y ajustes prerenderizados durante el build, hidratados en el navegador. Prerender en build no significa SSR en ejecución.
- `/api` es un proxy inverso, no una redirección del navegador: conserva método, cuerpo, cookies, estado, prefijo y consulta.
- El destino de la API se configura al arrancar, no queda incrustado en JavaScript.
- No introducir un BFF sin necesidad concreta. Si posteriormente se necesita, usar **Ohkami + Tokio**, separado del frontend estático.
- No tocar el trabajo Go pendiente ni publicar imágenes, desplegar o ejecutar carga remota sin otra autorización.

## Integración propuesta

### Frontend

Completar el frontend real en **SvelteKit 2.70.3 + Svelte 5.57.2**, con `adapter-static` 3.0.10 y el router cliente de Kit. Portar la composición y el marcado de los componentes Astro/React aprobados a componentes Svelte, reutilizando `src/styles/login.css`, `src/styles/dashboard.css` y los controladores TypeScript de cuenta. Astro permanece como backend/legacy separado: no se elimina ni pasa al runtime de la imagen.

Mantener `prerender = true`, `ssr = true` y `csr = true` en el layout raíz de Kit. Aquí `ssr = true` permite generar el HTML durante el build; no implica ejecutar un servidor SSR después. `adapter-static` permanece estricto y sin fallback global al login. La navegación posterior se realiza en el navegador.

Las previews `__migration` actuales se conservan en un árbol diagnóstico opt-in, separado de las rutas de producción, con sus pruebas de presentación. No se convierten en el frontend real cambiando solamente sus etiquetas ni se incluyen en la imagen.

El perfil genera `/`, `/dashboard`, las seis rutas de ajustes y `/logout`. No incluye endpoints de API ni la bandeja de desarrollo dentro de la imagen. La API actual permanece separada; sus archivos y reglas de autorización no se convierten en archivos públicos.

Las páginas de cuenta contienen un shell sin datos personales ni usuarios ficticios. Al hidratar:

1. Consultar `/api/session` sin cachear el resultado.
2. Mantener la vista protegida oculta/inactiva hasta conocer la sesión.
3. Ante 401, volver al login; ante fallo de red/servidor, mostrar error y reintento, sin fingir una sesión.
4. Rellenar nombre, correo, verificación, avatar y controles administrativos con datos reales, usando DOM seguro.
5. Inicializar los controladores existentes después de comprobar la sesión, también tras cada navegación SPA.

La comprobación cliente es UX, no una barrera de seguridad. La API sigue validando autenticación, pertenencia y permisos en cada operación. No persistir tokens de sesión ni datos de recuperación en almacenamiento del navegador.

El cliente de autenticación usa el origen actual y rutas `/api`, sin depender de una URL de backend compilada. Se conservan los IDs de proveedores, validación de aplicaciones/destinos, callbacks, passkeys y comportamiento local confirmado de botones sociales solo visuales/deshabilitados. Los controles de acceso y formularios permanecen deshabilitados antes de hidratar, con método POST y explicación sin JavaScript; nunca se envía un correo mediante GET.

La sesión se comprueba exclusivamente en el navegador y vuelve a validarse al navegar a vistas protegidas. Un fallo o respuesta malformada no habilita controles. Logout llama a la API real; solo tras éxito abandona la cuenta, y un fallo ofrece reintento.

### Desarrollo local

- El frontend dispone de un proxy de desarrollo para `/api`.
- `API_UPSTREAM` es configuración de servidor de desarrollo, no una variable pública del bundle.
- La topología local mantiene `auth.localhost` como origen público. El frontend tiene un comando Portless propio y puede hacer proxy a la API Astro en un puerto loopback separado; los comandos se documentan sin cambiar credenciales, cookies ni base de datos.
- La configuración y comandos actuales del backend se conservan. No es necesario reescribir la API para producir el frontend estático.
- Kit conserva su aislamiento de entorno en `src/kit` y el prefijo público `PUBLIC_KIT_`; no se abre la lectura del `.env` raíz ni se expone el código de servidor mediante la allowlist de Vite. La política local es opt-in y solo de desarrollo.

### Imagen

Build multistage:

1. Construir el frontend estático con las dependencias fijadas por `bun.lock`.
2. Precomprimir los assets en Brotli, Zstd, gzip y HTTP deflate con envoltura zlib, conservando originales.
3. Compilar Nginx estático y un lanzador mínimo. Los compiladores y compresores no pasan al runtime.
4. Copiar únicamente Nginx, lanzador, configuración/tipos MIME, certificados CA, licencias y archivos estáticos a `scratch`.

El lanzador es un ejecutable estático de configuración, no un servidor ni un BFF. Lee y valida `API_UPSTREAM`, `PORT` y los resolvers del contenedor, genera la configuración en `/tmp` y ejecuta Nginx como PID 1. No requiere shell ni `envsubst`.

Variables:

| Variable | Contrato |
| --- | --- |
| `API_UPSTREAM` | Obligatoria en la imagen; origen HTTP/HTTPS, sin credenciales, ruta, consulta ni fragmento. El proxy conserva `/api` y la consulta original. |
| `PORT` | Puerto de escucha, por defecto 8080; compatible con el puerto asignado por Railway. |

El `tiny` del laboratorio es HTTP-only. Para aceptar un upstream HTTPS hay que compilar soporte SSL, incluir CA y verificar certificado y nombre/SNI. No usar verificación TLS desactivada como sustituto.

El contenedor funciona sin root, con filesystem de solo lectura y `/tmp` temporal. No copia `.env`, secretos, `.git`, bases de datos, código del backend ni artefactos de Go/Rust.

### Enrutamiento y caché

- `/api` y `/api/*`: exclusivamente proxy, nunca fallback al HTML, nunca caché de estáticos. Errores, 401 y cookies se conservan.
- El resto: archivos prerenderizados y assets. Las rutas profundas funcionan al abrirlas directamente y al navegar como SPA.
- Assets fingerprinted: caché larga `immutable`; HTML: revalidación/no-cache. Recursos desconocidos: 404 correcto.
- Compresión solo en build, respetando exclusiones `q=0`, `Vary`, MIME, HEAD y validadores. Las fixtures y límites de benchmark no se copian como autenticación de producción.
- Salud del servidor estático separada de la salud de la API: la portada no necesita esperar a que despierte el backend.

## Verificación requerida

- Build sin acceso a sesiones, usuarios, credenciales o base de datos de producción.
- Pruebas de HTML prerenderizado sin datos personales, hidratación de perfil, sesión inválida, errores/reintentos y navegación SPA de todas las vistas reales.
- Regresiones de autenticación/ajustes existentes y contraste del diseño A.
- Pruebas del lanzador para variables inválidas, resolvers, puertos y upstream HTTP/HTTPS.
- Imagen real: `nginx -t`, arranque no-root/read-only, deep links, decodificación/hashes y validadores de assets.
- API de prueba aislada: métodos/cuerpos/cookies/prefijo/query/status y 401; comprobar que `/api` no devuelve el shell SPA.
- Arrancar la misma imagen con dos valores de `API_UPSTREAM`, sin recompilar, y comprobar que cambia únicamente el backend elegido.

## Estado operativo verificado

Tras el reinicio, Docker responde con servidor 29.9.1. La imagen completa se construyó y pasó nueve pruebas reales de Docker/Chrome, incluido cambio de upstream sin reconstrucción, TLS validado y autenticación contra una API aislada. El bloqueo anterior por sockets inexistentes quedó resuelto; no se iniciaron servicios ajenos ni se publicó/desplegó la imagen.

## Fuera de alcance

Nuevo motor de autenticación, migración del backend a Go/Rust, BFF preventivo, cambios de esquema, despliegue Railway, publicación de imagen, benchmarking de carga o afirmaciones de cold start/tamaño no medidos. La migración del frontend a SvelteKit sí forma parte del alcance elegido.

## Referencias verificadas

- [Prerender con adapter-static en Kit 2.70.3](https://github.com/sveltejs/kit/blob/%40sveltejs%2Fkit%402.70.3/documentation/docs/25-build-and-deploy/50-adapter-static.md): conservar render en build para producir HTML completo.
- [Proxy de desarrollo de Vite 6](https://v6.vite.dev/config/server-options.html#server-proxy): prefijo exacto, sin eliminar `/api`, sin desactivar la validación TLS.
- `capy-school/nginx-static-bench`: referencia privada leída con `gh`; no se modifica durante este trabajo.
