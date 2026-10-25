# Rust Ohkami Local Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user approved inline implementation in a separate `server-rust/` directory; preserve existing Go work.

**Goal:** Provide a tested native Rust equivalent of the existing Go persistence, with Ohkami diagnostics and an honest comparison matrix.

**Architecture:** Domain and application ports point inward; a private Turso adapter implements mapping, codecs, parameterized CRUD and scoped transactions. Ohkami runs only a loopback diagnostic route, with no database or authentication endpoint wired into the server.

**Tech Stack:** Rust 2021, time with extended years, Tokio, Turso 0.8.3, Ohkami 0.24.9, serde/serde_json at external boundaries.

---

## File map and safety

- `server-rust/Cargo.toml`, `Cargo.lock`, `.gitignore`: independent application crate and ignored `target/`.
- `src/lib.rs`, `domain.rs`, `application.rs`: five Go-equivalent model structs, typed ports/errors/pagination/unit of work.
- `src/infrastructure/mod.rs`, `turso/{mod,schema,codec,mapping,store,transaction}.rs`: private persistence implementation; only metadata and the constructor are exported.
- `tests/core.rs`, `tests/repositories.rs`, `tests/transactions.rs`, `tests/common/mod.rs`: public-boundary tests and synthetic in-memory fixtures. Private schema/codecs/store tests live with their modules.
- `src/http.rs`, `src/main.rs`, `tests/http.rs`: fixed diagnostics and loopback executable, never an auth-table CRUD API.
- `GO_REFERENCE.sha256`, `README.md`: source snapshot and parity/results/limitations.

Only new Rust files and this plan/spec are authorized changes. Do not edit or stage Go, frontend, root config, secrets or databases. Use exact paths with `git commit --only`; the index already contains unrelated user work.

## Task 1: Standalone core contracts

- [ ] Capture hashes of all current `server/internal/auth/**/*.go`, `server/go.mod` and `server/go.sum` as `server-rust/GO_REFERENCE.sha256`, with paths relative to `server-rust/`. Baseline `go test -count=1 ./...` must pass.
- [ ] Create an independent Cargo crate named `auth-rust-comparison`, `edition = "2021"`, initially depending on `time = { version = "0.3", features = ["large-dates", "formatting", "parsing"] }`. Ignore only `/target/` locally. Do not load env files or create a workspace in the project root.
- [ ] Write `tests/core.rs` before the API: assert pagination defaults, caps and negative rejection, domain option/date values, Send/Sync ports and no framework/SQL imports in domain/application source.

```rust
assert_eq!(Page::default().bounds().unwrap(), (100, 0));
assert_eq!(Page { limit: 2000, offset: 2 }.bounds().unwrap(), (1000, 2));
assert!(Page { limit: -1, offset: 0 }.bounds().is_err());
assert!(Page { limit: 1, offset: -1 }.bounds().is_err());
```

- [ ] Run `cargo test --test core`; record missing-API compiler RED separately from behavioral assertion failures.
- [ ] Implement every field from Go `domain/models.go` using snake_case Rust names, `String`, `Option<String>`, `bool`, `time::OffsetDateTime` and optional timestamps. Do not derive persistence/HTTP serialization on domain models.
- [ ] Define `Error`, `Result`, `Page`, boxed Send future alias and typed `Repository<T>` ports for Create/Get/List/Update/Delete, plus the same specialized lookup traits. Application `Repositories` holds `Arc<dyn ...>` ports and `Arc<dyn UnitOfWork>`; the callback owns a cloned repository bundle. No runtime, SQL or SDK types enter these ports.

```rust
pub type RepoFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = Result<T>> + Send + 'a>>;
pub type TransactionCallback<'a> = Box<dyn FnOnce(Repositories) -> RepoFuture<'a, ()> + Send + 'a>;
pub trait UnitOfWork: Send + Sync {
    fn within_transaction<'a>(&'a self, callback: TransactionCallback<'a>) -> RepoFuture<'a, ()>;
}
```

- [ ] Run core tests and formatting. Commit the core contract, manifest/lock, reference snapshot and tests together.

## Task 2: Validated mapping metadata and private codecs

- [ ] Add `turso = { version = "=0.8.3", default-features = false }`, `serde_json = "1"` and Tokio with macros/rt-multi-thread/sync/net/time. Use two build jobs for native compilation; do not change global toolchain/config.
- [ ] Write metadata tests for all Go schema rejection cases, ownership isolation and custom physical column names. Write codec cases matching Go's opaque strings, booleans, offset date truncation, signed/unsigned/float/finite handling, JSON, SQL NULL and text bytes. Cover year0, -1,10000, TimeClip endpoints and overflow without leaking values in errors.

```rust
assert!(validate_schema(Schema::new()).is_err());
assert_eq!(encode(&date_field, &Value::Date(offset_date))?, turso::Value::Text("2026-10-12T11:14:15.123Z".into()));
assert!(encode(&number_field, &Value::Float(f64::NAN)).is_err());
```

- [ ] Observe expected RED, then implement strict ASCII allowlisting and immutable owned metadata. Use a BTreeMap for deterministic record/field order; field kinds are an exhaustive enum, so unknown kinds are unrepresentable rather than silently accepted.
- [ ] Date encoding emits UTC millisecond ISO strings with Go-compatible extended-year prefixes. Use `div_euclid` when deriving negative Unix milliseconds. Decode normal RFC3339 and canonical extended years, validate TimeClip and reject malformed/corrupt storage. Keep JSON and SQL records private to the adapter.
- [ ] Run private schema/codec and core tests, then commit that tested storage contract. Intermediate helpers may not yet be wired to public repositories; do not claim full persistence before Task4.

## Task 3: Actual-engine CRUD primitive

- [ ] Before implementation, add in-module tests using `turso::Builder::new_local(":memory:")` and a synthetic table. Test lifecycle, missing rows, parameterized hostile strings, NULL filters, default/capped/negative pagination, deterministic ID order, invalid model/field/ID, immutable primary key and affected-row errors.
- [ ] Implement a private Store with the injected native Connection shared by Arc, frozen metadata and root Tokio mutex. Never call `Connection::clone`, open a path or run DDL in the constructor. Use explicit SQL identifiers from validated metadata and `turso::params_from_iter` for values.

```text
INSERT INTO "table" ("column", ...) VALUES (?, ...)
SELECT "columns" FROM "table" WHERE "column" = ? ORDER BY "id" ASC LIMIT ? OFFSET ?
UPDATE "table" SET "column" = ? WHERE "id" = ?
DELETE FROM "table" WHERE "id" = ?
```

- [ ] Drain every Rows stream completely before releasing the operation guard. Decode values at the infrastructure boundary and map zero-row writes/reads to application NotFound.
- [ ] Run actual-engine store tests and all prior tests. Commit the primitive and its tests before exposing HTTP or declaring auth functionality.

## Task 4: Typed repositories and safe unit of work

- [ ] Add five-model fixtures with the same synthetic logical kinds/nullability as Go, physical aliases and no real credentials. Write typed lifecycle/lookup/ambiguous-result/constructor-mismatch tests before the factory.
- [ ] Add private Entity conversion helpers and five specialized repository implementations. Validate all entity bindings at construction and return the application-owned Repositories bundle. Update replaces mapped fields and never generates IDs/timestamps or decrypts secrets.
- [ ] Add transaction tests for success, callback error, constraint rollback, panic, aborted callback future, nested calls, leaked handles and continued connection usability. Include an operation that retains a transaction handle across completion; no statement may fall through to the root connection.
- [ ] Implement UnitOfWork on the same frozen Store. A root mutex protects whole transactions; a separate per-scope operation mutex serializes child SQL and commit/rollback. Validate the active scope **after** acquiring its operation mutex, not just before awaiting. Finalization drains operations, invalidates the scope and finishes the native transaction.
- [ ] A synchronous drop guard invalidates the scope on panic/cancellation. Retain the closed scope in shared cleanup state so the next root operation drains any already-started child operation before touching the same Connection; Turso then performs its deferred rollback. This avoids both stale-handle SQL and a root rollback racing a still-running child statement. Reject nested transaction bundles before acquiring the root mutex.
- [ ] Run all actual-engine tests, including Tokio cancellation/panic cases. Document Rust future cancellation versus Go context cancellation and deferred cleanup timing. Keep typed persistence and transactions in one independently usable work unit; if it exceeds the approximate400-line review budget, report the real size instead of compressing tests or splitting a broken intermediate factory.

## Task 5: Ohkami adapter and reproducible comparison

- [ ] Add `ohkami = { version = "=0.24.9", default-features = false, features = ["rt_tokio"] }` and serde derive for the external diagnostic DTO only. Inspect the exact downloaded APIs, not latest-version examples.
- [ ] Write Ohkami no-network tests for fixed `GET /healthz`, `no-store`, no Set-Cookie and absent auth CRUD/routes. Observe RED before route implementation. Use Ohkami's Tester/oneshot and assert the response JSON, not just status.
- [ ] Create the route using the documented routing API:

```rust
use ohkami::{Ohkami, Route};
pub fn app() -> Ohkami {
    Ohkami::new("/healthz".GET(health))
}
```

The diagnostic JSON identifies the Rust candidate with `authentication: false` and `storage_connected: false`. The handler is independent of repositories and DB configuration.

- [ ] Add the Tokio executable, accepting only an optional numeric `--port` (default5051), pre-binding `127.0.0.1` and printing the actual local address before `app().howl(listener).await`. No env-file loader, database URL or schema creation. Smoke-test the release binary over real loopback HTTP and stop only the owned process.
- [ ] Write README commands, field/behavior parity matrix, architecture boundary, Go snapshot provenance and verified limitations. Explicitly distinguish Rust's diagnostic server from absent Go HTTP/auth; no HTTP performance comparison or production readiness claim.
- [ ] Run `cargo fmt --check`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo build --release`, unchanged Go tests and `go test -race -count=1 ./...`. Check `sha256sum -c GO_REFERENCE.sha256` from `server-rust/` and final Git status. No Go hash or frontend file may change.
- [ ] Request an independent read-only scoped review, address evidence-backed findings, rerun affected tests, and commit the Ohkami/comparison unit with explicit Rust paths only.

## Completion evidence

Record each work-unit hash and observed RED/GREEN, exact test commands, release binary smoke and reference-hash results. Approximate400-line units protect review focus; generated Cargo.lock lines are reported separately. No source/secret/DB changes outside the Rust candidate and its design/plan are part of this task.

Rollback removes only the new Rust candidate/spec/plan. Existing uncommitted Go work and the static SvelteKit checkpoint4fef06a remain intact.
