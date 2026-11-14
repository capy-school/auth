# Arranque local

El frontend es SvelteKit; Astro sirve únicamente la API. No sobrescribas `.env` ni borres bases existentes para arrancar.

```bash
bun install --frozen-lockfile --ignore-scripts
# Primera preparación local explícita; omitir si ya está lista:
npm run dev:setup
```

En dos terminales:

```bash
npm run api:dev
```

```bash
npm run dev
```

Abre `http://auth.localhost` (requiere Portless). Solicita un magic-link y usa la bandeja local enlazada en el login; no hacen falta proveedores ni correo productivos.

Para comprobar sin tocar tu almacenamiento local:

```bash
npm run check
npm run build
npm test
```

Las pruebas crean su propio almacenamiento temporal. Consulta [README](README.md) para los requisitos y comandos actuales, [SETUP](SETUP.md) para los límites de configuración y la [guía de imagen](docs/static-image.md) para el proxy/runtime.
