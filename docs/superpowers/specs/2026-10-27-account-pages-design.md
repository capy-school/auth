# Área de cuenta A: páginas reales y sesiones activas

**Diseño aprobado:** extender el diseño A a toda el área de cuenta, convertir el menú en navegación entre páginas y sustituir las notas por sesiones activas. El usuario eligió explícitamente esta opción y aprobó continuar tras revisar el alcance y sus limitaciones.

## Resultado esperado

Una persona autenticada puede moverse entre resumen, seguridad, sesiones y organizaciones sin cambiar de lenguaje visual ni encontrar enlaces que solo desplazan la página. Desde el resumen puede reconocer su sesión actual y acceder a la gestión de las demás.

Se mantiene la dirección ya aprobada: superficies claras, acento verde contenido, tipografía de sistema y navegación lateral. El contexto sigue siendo una persona revisando su cuenta durante su jornada, en un entorno normalmente iluminado. No hace falta explorar otra estética ni generar nuevas maquetas.

## Páginas y navegación

| Destino | Ruta | Comportamiento |
| --- | --- | --- |
| Resumen | `/dashboard` | Identidad real, accesos a ajustes y resumen de sesiones en lugar de notas |
| Seguridad | `/settings/security` | Nueva página que organiza los métodos de acceso y enlaza sus ajustes |
| Passkeys | `/settings/passkey` | Listar, añadir, renombrar y eliminar mediante las APIs existentes cuando el servidor las habilita |
| Autenticación en dos pasos | `/settings/2fa` | Estado del servidor y operaciones reales, sin simulación local |
| Claves de API | `/settings/api-keys` | Crear, consultar y revocar claves; mostrar el secreto nuevo solo cuando lo devuelve el servidor |
| Sesiones | `/settings/sessions` | Nueva página con sesiones vigentes y revocación de otras sesiones |
| Organizaciones | `/settings/organizations` | Conservar creación, selección, miembros e invitaciones |
| Cerrar sesión | `/logout` | Conservar el flujo existente |

El menú principal contiene **Resumen, Seguridad, Sesiones y Organizaciones**. Passkeys, 2FA y claves de API mantienen Seguridad como sección activa. Cada página tiene título propio, migas de navegación y estado activo correcto; los enlaces del menú no son anclas al resumen. El salto accesible al contenido sí sigue siendo un ancla.

En móvil se conservan los cuatro destinos, con distribución que pueda pasar a dos filas en pantallas estrechas. No se ocultan opciones ni se exige desplazamiento horizontal para encontrarlas.

## Estructura compartida

- Un shell de cuenta reutilizable concentra menú, identidad, cierre de sesión y cabecera. Usa el documento y los tokens claros de A.
- Resumen y páginas de ajustes proporcionan su contenido y sección activa al shell. Los componentes de gestión usan los mismos campos, botones, listas y mensajes.
- Se mantiene Astro para rutas y control de sesión, con la interactividad React o DOM que ya utiliza el proyecto. No se migra a SvelteKit ni se añade otra biblioteca visual.
- No se cambia el diseño de la página de acceso. No se crea un nuevo sistema de administración; un enlace sin destino implementado no debe publicarse como acción disponible.

## Sustituto de las notas: sesiones activas

### En el resumen

El panel secundario muestra una lista breve de sesiones reales, distingue la actual y ofrece **Gestionar sesiones**. Presenta navegador o dispositivo solo cuando puede inferirse de los datos disponibles, y una fecha con significado explícito, como creación o caducidad. No inventa ubicaciones ni presenta la fecha de actualización como actividad reciente.

### En la página de sesiones

Se muestran las sesiones vigentes y una acción **Cerrar sesión** para cada sesión distinta de la actual. La actual queda claramente identificada; para cerrarla se usa el enlace de salida ya existente. Antes de revocar otra sesión se solicita confirmación. El resultado se comprueba en el servidor y se actualiza el listado.

Los tokens que requiere la API de revocación no se muestran como texto, no se guardan en almacenamiento local ni se incluyen en atributos HTML o registros de diagnóstico. La autorización sigue correspondiendo al servidor.

### Estados

| Estado | Respuesta de la interfaz |
| --- | --- |
| Carga | Indicador estable, sin mostrar cifras o sesiones ficticias |
| Datos | Identificación de la sesión actual cuando está disponible y listado real |
| Lista vacía | Mensaje específico, solo después de una respuesta válida vacía |
| Error | Mensaje y reintento; no confundir fallo con ausencia de sesiones |
| Revocación | Acción pendiente deshabilitada; confirmación solo tras éxito |
| Sesión caducada o comprobación adicional | Explicar que hace falta volver a autenticarse, sin simular la operación |

Las notas dejan de renderizarse y su controlador deja de inicializarse en el área de cuenta. **No se borra ni migra `secure_notes_data`.** Los datos existentes permanecen intactos en el navegador.

## Funciones reales y límites de seguridad

Los controladores conservan las operaciones existentes, pero sus estados y errores pasan a ser visibles. Los valores proporcionados por usuarios o servidores se renderizan como texto, incluido el nombre de las claves de API; no se interpolan en `innerHTML`.

Hay dos diferencias de configuración verificadas que no deben ocultarse:

1. **2FA:** la interfaz actual es una simulación. Se sustituye por operaciones de Better Auth y estado confirmado en el servidor. La versión instalada exige una contraseña válida para habilitarlo; las cuentas sin contraseña no pueden fingir esa operación. Se explica la limitación y no se añade un nuevo método de acceso ni se debilita la verificación para evitarla.
2. **Passkeys locales:** el servidor local actual no registra ese plugin, aunque producción sí lo configura. La página debe distinguir disponibilidad de error y no anunciar una passkey creada sin respuesta válida. Habilitar el plugin local y migrar su base de datos no forma parte de esta ampliación visual y de navegación.

No se modifica la política de autenticación, no se amplía el acceso anónimo y no se convierte el estado de `localStorage` en una prueba de seguridad. Las rutas nuevas requieren una sesión válida. No se exponen secretos del servidor en props del navegador.

## Verificación prevista

- Pruebas SSR de rutas, títulos, shell coherente, sección activa y enlaces reales; usuarios anónimos no reciben contenido privado.
- Pruebas de estados de sesiones, confirmación, revocación, errores, reintentos y exclusión de la sesión actual.
- Pruebas contra Better Auth aislado para listar y revocar sesiones propias y rechazar la revocación de otra cuenta. No se usa una sesión ni una base de datos real del usuario.
- Pruebas de las operaciones de ajustes, límites de disponibilidad y rechazo de una activación 2FA ficticia. Los estados simulados de pruebas no sustituyen la verificación del contrato del servidor.
- Pruebas de texto hostil en nombres de claves, organizaciones y perfil; preservación literal del almacenamiento de notas al visitar las nuevas vistas.
- Chrome a 1440, 390 y 320 píxeles: navegación, formularios, foco, contraste, feedback accesible y ausencia de desbordamiento horizontal.
- Adaptar las pruebas del panel de notas retirado, mantener la cobertura de compatibilidad de sus datos y ejecutar las regresiones existentes de autenticación y presentación.

## Límites de entrega

Los cambios de Go/Rust, migraciones de datos, despliegues y credenciales quedan fuera. Se preserva el trabajo previo del índice y del árbol de trabajo. No se hace commit ni push sin una petición independiente.

## Entrega y verificación

Implementado siguiendo `docs/superpowers/plans/2026-10-27-account-pages.md`. El plan contiene comandos, resultados, hallazgos de revisión y límites de la verificación. La entrega permanece en el árbol de trabajo, sin commit, push ni despliegue.
