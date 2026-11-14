# Cierre de la migración del frontend

El usuario confirmó que la limpieza del frontend ocurre **ahora**. El BFF y los servicios que reemplacen la API se desarrollarán en otra iteración; no se espera a ellos ni se porta la API a SvelteKit.

## Resultado

- `src/routes`, `src/lib` y `src/app.html`: único frontend SvelteKit estático, con la UI A y las nueve rutas funcionales actuales.
- `api/`: API Astro + Better Auth actual, sin páginas ni componentes de la interfaz anterior. Conserva endpoints, cookies, SSO, base de datos y configuración existente.
- `shared/`: únicamente registro de aplicaciones y política de destinos sin efectos ni frameworks, usados por frontend y API.
- `server/` y `server-rust/`: candidatos congelados; archivos e índice Git intactos.

Los controladores de cuenta se trasladan al frontend y se montan explícitamente desde Svelte. Se retiran el montaje automático de Astro, páginas/componentes Astro/React anteriores y previews de migración desconectadas. No se reescriben los flujos de cuenta ni se crea un sistema de componentes nuevo.

## Herramientas y límites

`dev`, `build`, `check` y `preview` pertenecen al frontend. Los comandos `api:*` son explícitos y conservan el runtime actual. El entorno del frontend se aísla en `config/frontend`; el backend sigue leyendo su entorno anterior sin copiar secretos. La configuración de producción del backend queda bajo `api/`.

Docker `tiny` sigue siendo Nginx scratch con `/api` externo configurable al arrancar. La imagen y el CI de frontend no copian fuentes ni variables del backend. Las dependencias Astro y de persistencia pasan al workspace `api`; no se actualizan sus versiones.

Antes de retirar pruebas legacy se conserva su cobertura relevante en Svelte: render genérico sin PII, autorización del navegador, sesión y logout, operaciones de managers, foco, responsive, contraste y destinos seguros. Las pruebas exclusivas de previews y SSR Astro se sustituyen por verificaciones de ausencia de legacy y contratos del frontend real, no por skips.

## Verificación

Pruebas estructurales, unitarias y de navegador; build/check del frontend y build de la API separada; CI dockerizado y aceptación de la imagen real. Usar instancias Better Auth y almacenamiento de prueba aislados. No acceder a cuentas ni bases de producción. No commits, push, publicaciones ni despliegues sin otra autorización.
