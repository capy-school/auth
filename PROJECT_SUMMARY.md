# Estado del proyecto

La migración deja **un único frontend SvelteKit estático** y mantiene **la API Astro + Better Auth actual** separada, sin portar el backend ni crear un BFF.

| Área | Ubicación y responsabilidad |
| --- | --- |
| Frontend | `src/routes`, `src/lib`, `src/styles`; UI A, sesión y operaciones de cuenta desde el navegador |
| Backend vigente | `api/src`; rutas Astro, Better Auth, SSO y persistencia existentes |
| Política compartida | `shared`; registro de apps y validación de destinos sin entorno ni I/O |
| Assets públicos | `static` |
| Runtime de frontend | Nginx `scratch`, proxy `/api` configurado al arrancar |
| Candidatos backend | `server`, `server-rust`; congelados para esta migración |
| Futuro | BFF y servicios que reemplacen la API |

Se eliminaron la UI Astro/React duplicada y las previews de migración desconectadas. No se cambia el esquema de datos ni se ejecutan migraciones productivas para construir el frontend.

El [README](README.md) es la referencia de uso actual. Los [recibos del cierre](docs/superpowers/plans/2026-11-08-frontend-migration-cleanup.md) distinguen las comprobaciones actuales de los planes históricos.
