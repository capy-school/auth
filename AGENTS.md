# Core-Infra Bridge Architecture (CIBA)

## Alcance y principio rector

Guía para backends, APIs y frontends de cualquier lenguaje bajo `microservices/`.
CIBA combina core funcional, slices, modularidad, ISP y composición; no es Clean Architecture.
**Core decide; Infrastructure ejecuta mecanismos y efectos; Orchestration integra.**
Preservar repos/crates independientes; no fusionar, reestructurar ni migrar sin solicitud explícita.

## Responsabilidades y política de imports

```text
          Orchestration
          /           \
         v             v
       Core      Infrastructure
       Core   X  Infrastructure
```

- **Core:** objetos de valor, entidades (incluidas raíces de agregados) y operaciones puras; sus invariantes viven con quien las garantiza.
- **Infrastructure:** ORM, SQL, HTTP, filesystem, redes, serializadores y frameworks.
- **Orchestration:** workflows, repositorios, interfaces puente y conversiones.
- Core depende exclusivamente de la biblioteca estándar; no importa otras capas.
- Infrastructure puede usar bibliotecas externas; no importa Core ni Orchestration.
- Orchestration puede importar ambas capas y componer sus dependencias.
- Esta política prevalece sobre convenciones de Clean Architecture/Ports and Adapters.
- Infrastructure devuelve representaciones propias; nunca entidades de Core.
- Infrastructure no implementa contratos que requieran importar Core u Orchestration.
  El wrapper/repositorio que conecta ambas representaciones vive en Orchestration.

## Organización por capacidad de negocio

Usar `[module | module/slice]/[layer]`; crear solo las responsabilidades necesarias.

```text
src/
├── users/
│   └── create/
│       ├── core/
│       ├── orchestration/
│       └── infrastructure/
├── orders/
│   ├── core/
│   ├── orchestration/
│   └── infrastructure/
└── api/                 # Composition root e integración HTTP
```

Mantener límites entre slices y entrypoints públicos explícitos; evitar mezclar dominios.
Extraer abstracciones compartidas solo cuando haya reutilización real.

## Core: funciones e invariantes puras

- Contrato: `Input → Pure Function → Output`, determinista y sin I/O.
- Recibir tiempo, identidad, configuración y datos externos como argumentos.
- Devolver estados válidos, decisiones, hechos de dominio o errores de dominio como datos.
- No definir interfaces de persistencia, contenedores DI ni instrucciones de efectos.
- No devolver secuencias de comandos, `yield` ni planes de I/O que otra capa interprete paso a paso.
  Un evento de dominio puede describir un hecho; no ordena publicarlo.
- Aplicar invariantes con constructores/factories y mecanismos de la stdlib.
- Pydantic, Zod, Serde y validadores externos pertenecen a adaptadores, no al Core.
  Validan parsing, estructura y contratos; no sustituyen invariantes de negocio.
- Se permite un vocabulario declarativo propio con stdlib cuando facilite reutilizar restricciones.

### Ubicación dentro de Core

Usar estas categorías internas cuando haya código que las justifique; no crear carpetas vacías:

```text
core/
├── value_objects/  # Valores válidos por construcción; igualdad por valor.
├── entities/       # Identidad, ciclo de vida e invariantes; incluye raíces de agregados.
└── operations/     # Decisiones puras sin dueño natural entre los objetos.
```

- Colocar cada invariante en el objeto que pueda garantizarla: constructor o método
  de valor, entidad o raíz de agregado. La raíz controla cambios de sus miembros.
- Usar `operations/` solo si la decisión no pertenece naturalmente a un objeto;
  nombrar la función por la operación de negocio, sin requerir clases `Service`/`Policy`.
- Una operación recibe objetos y hechos externos como argumentos y devuelve estados
  válidos o decisiones tipadas; Orchestration obtiene los datos y coordina efectos.
  Si varios cambios deben ser atómicos, proteger su persistencia en una transacción.
- Son subcarpetas de Core, no crates/capas nuevas ni una orden de migrar código existente.

### Ejemplos mínimos de valores válidos

Rust: campos privados, constructores, enums y `Result`; traits/const generics si aportan.

```rust
pub struct Quantity(u32);
impl Quantity {
    pub fn new(value: u32) -> Result<Self, &'static str> {
        if value == 0 { return Err("Invalid quantity"); }
        Ok(Self(value))
    }
}
```

Python: `dataclass`, `__post_init__` y funciones puras con tipos explícitos.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Quantity:
    value: int

    def __post_init__(self) -> None:
        if type(self.value) is not int or self.value <= 0:
            raise ValueError("Invalid quantity")
```

`Annotated` admite restricciones propias: p. ej. `Annotated[int, Positive()]`, con metadata stdlib.
Los metadatos no validan solos: Core los aplica mediante constructores o funciones puras.
El traductor vive en **Orchestration**: conoce metadata Core y contratos técnicos externos.
Al componer la API, leer `get_type_hints(..., include_extras=True)` y generar modelos
Pydantic antes de registrar rutas/validar peticiones: `Positive()` → `Field(gt=0, strict=True)`.
FastAPI usa esos modelos para validar y generar JSON Schema/OpenAPI; Core no importa Pydantic.
Las invariantes no expresables en JSON Schema siguen en Core; documentar los límites.
Probar equivalencia Core/adaptador y esquema generado; rechazar restricciones sin traducción soportada.
Mantener el vocabulario acotado; no construir un motor universal sin necesidad real.

TypeScript: `readonly`, uniones discriminadas y factories; brands cuando sean útiles.

```typescript
declare const quantityBrand: unique symbol;
type Quantity = number & { readonly [quantityBrand]: true };
function quantity(value: number): Quantity {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid quantity");
  }
  return value as Quantity;
}
```

La factory controla la construcción; no dispersar casts que eludan la validación.

## Orchestration: workflows, repositorios y glue code

- **Workflow:** ordena llamadas y coordina efectos, transacciones y servicios externos.
- **Repository:** solicita persistencia y traduce registros a entidades Core y viceversa.
- **Glue code:** adapta contratos, representaciones y errores; no requiere archivo propio.
- Flujo: consultar Infrastructure → convertir → Core → convertir → efectos → respuesta.
- Coordinar reintentos/idempotencia/compensaciones aquí; las decisiones puras van en Core.
- Usar constructores, factories y composición explícita; evitar Service Locator.

### Interfaces angostas en Orchestration

Declarar solo capacidades requeridas: `Reader`, `Writer`, `Searcher`, `Counter`,
`Deleter`. No todos los repositorios necesitan todas ellas ni CRUD genérico.

```rust
pub trait Reader {
    type Entity;
    type Error;
    fn get(&self, id: i64) -> impl std::future::Future<
        Output = Result<Option<Self::Entity>, Self::Error>> + Send;
}
```

Elegir explícitamente si el future necesita `Send`. Preferir tipos asociados para
una entidad principal; traits genéricos para múltiples entidades por implementación.
Respetar coherencia/orfandad; crear wrappers/newtypes en Orchestration si hace falta.

```python
from typing import Protocol, TypeVar
T_co = TypeVar("T_co", covariant=True)
class Reader(Protocol[T_co]):
    def get(self, id: int) -> T_co | None: ...
```

```typescript
interface Reader<T> { get(id: number): Promise<T | null>; }
interface Writer<T> { save(value: T): Promise<void>; }
```

Un repositorio puede satisfacer varias capacidades; Infrastructure conserva contratos propios.

## Frameworks y puntos de entrada

Los frameworks son adaptadores técnicos, no dominio. La integración `api/` es un
composition root externo al paquete Infrastructure: registra rutas, construye
dependencias, enlaza HTTP y llama a Orchestration, sin negocio ni imports prohibidos.
- **Ohkami:** rutas, extractores, estado/contexto, traits, genéricos y `Arc` cuando proceda.
- **FastAPI:** endpoints, schemas Pydantic y DI en integración HTTP; Dishka solo si aporta.
- **React:** componentes/hooks como adaptadores; efectos externos fuera del Core,
  coordinación reutilizable en Orchestration, sin capa `presentation` artificial.
Mantener la organización idiomática del framework; no imponer cuatro capas horizontales.

## Dependencias existentes y verificación

Consultar cada `Cargo.toml`: no propagar dependencias de Words a los otros crates.
Ohkami/Tokio/Turso/Serde y similares quedan fuera del Core; también `chrono` de
Learning. CMS y Tracking no requieren añadir bibliotecas por adoptar esta guía.
Preferir stdlib y tipos/errores explícitos antes que nuevas bibliotecas o abstracciones.

- **Core:** unit tests deterministas de invariantes/decisiones; sin mocks de infraestructura.
- **Orchestration:** workflows, conversiones, secuencias y errores con fakes/in-memory.
- **Infrastructure:** integration tests de SQL, ORM, APIs y serialización.
- **API:** contratos HTTP, códigos, schemas, binding y errores.
- Verificar imports, invariantes, conversiones y pruebas; reportar límites no verificados.
