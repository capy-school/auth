# Entorno del frontend

SvelteKit y Vite solo descubren archivos de entorno aquí, nunca en la raíz del backend. Los `.env*` están ignorados por Git y excluidos de Docker.

- `PUBLIC_KIT_AUTH_LOCAL_MODE=1`: política local, solo durante desarrollo.
- `API_UPSTREAM`: transporte del proxy Vite, solo de servidor; la imagen Nginx lo recibe al arrancar.

No guardar secretos de autenticación ni de base de datos en este directorio. El comando raíz `dev` ya activa el modo local sin requerir un archivo aquí.
