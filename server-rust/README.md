# Local Rust + Ohkami comparison

An additive, native Rust implementation of the existing **Go persistence**, not an authentication service. It includes the same five domain models, typed repositories, codecs and unit of work. Ohkami exposes a disconnected diagnostic only; Go, the frontend, existing databases and production infrastructure are unchanged.

## Run locally

From the repository root:

```bash
cargo run --locked --manifest-path server-rust/Cargo.toml -- --port 5051
```

In another terminal:

```bash
curl -i http://127.0.0.1:5051/healthz
```

Expected: HTTP 200, `Cache-Control: no-store`, no `Set-Cookie`, and:

```json
{"candidate":"rust-ohkami-comparison","authentication":false,"storage_connected":false}
```

The executable binds only `127.0.0.1`. Port 5051 is the default; `--port 0` chooses an available port and prints its address. Stop it with Ctrl+C. It accepts no database URL, loads no `.env` file, and opens no database. Authentication and auth-table CRUD routes are absent; this response is **not** a storage/readiness check.

## What to compare

| Area | Go reference | Rust candidate |
| --- | --- | --- |
| Domain | User, Session, Account, Verification, TwoFactor | Same fields; `Option<T>` for nullable values, `OffsetDateTime` for dates |
| Ports | Typed repository interfaces | Typed, `Send + Sync` traits with boxed asynchronous futures |
| Operations | Create, get, list, update, delete | Same lifecycle and missing-record behavior |
| Lookups | Email, token, provider + account, identifier, user | Same filters; non-unique single-record lookups are errors |
| Physical mappings | Explicit logical fields/table/column names | Owned, validated mappings; no inferred production schema |
| SQL | Parameterized values, allowlisted identifiers | Same approach; opaque strings remain inert values |
| Reads | ID order; default 100, cap 1000; reject negative pagination | Same tested bounds and ordering |
| Codecs | Strings, nullable values, booleans, finite numbers, JSON, dates | Same tested fixtures, including corrupt-value rejection and UTF-8 text bytes |
| Dates | UTC millisecond ISO encoding, extended years, JavaScript TimeClip bounds | Same tested encoding/range; valid offset and nanosecond decoding; reject non-`T` separators and leap seconds |
| Transactions | `database/sql` unit of work | Explicit native `BEGIN DEFERRED` / `COMMIT` / `ROLLBACK`, scoped repositories |
| Cancellation | Go `context.Context`; deferred synchronous rollback | Dropped Rust futures; recovery before the next root SQL operation |
| HTTP | No Go HTTP/authentication service in this reference | Ohkami `GET /healthz` only; not a comparable authentication API |

The comparison is functional and structural, **not a benchmark**. There are no comparative latency, throughput or memory results.

## Architecture and library use

```text
domain                 Five plain models
   ↑
application            Repository traits, errors, pagination, unit of work
   ↑
infrastructure/turso   Validated metadata, private codecs/mapping/SQL, transactions

http → Ohkami diagnostic DTO/route
main → Loopback listener and HTTP wiring only
```

Domain/application import neither Ohkami, Tokio, Turso nor serialization adapters. Database records and SQL stay private to infrastructure; diagnostic JSON does not serialize domain models.

The library entry point is `infrastructure::turso::new(connection, schema)`. The caller supplies an already-created native connection and explicit mappings. Construction validates metadata and entity bindings without querying, creating or migrating tables. See runnable examples in [`tests/common/mod.rs`](tests/common/mod.rs), [`tests/repositories.rs`](tests/repositories.rs) and [`tests/transactions.rs`](tests/transactions.rs). All test DDL uses synthetic in-memory databases, not the existing application database.

### Transaction ownership

- One injected connection lives in shared `Arc` state; the adapter never calls the SDK's `Connection::clone`.
- Root operations are serialized. A transaction holds that root gate, and its repositories share a separate per-scope operation gate. **Use the supplied transaction bundle inside its callback**, not a captured root bundle.
- Recovery is armed **before** `BEGIN`. Finalization drains child SQL, closes the scope, and commits only a successful callback; callback/constraint errors roll back. Nested calls through the transaction bundle and escaped handles fail explicitly.
- Panic/cancellation invalidates the scope synchronously. The next root operation drains already-started child operations and rolls back a still-open transaction before its own SQL. Canceling that cleanup does not discard recovery state.

This deliberately avoids relying on Turso 0.8.3's deferred transaction destructor. Rust cleanup timing is not identical to Go's deferred `sql.Tx.Rollback`, and dropping a future is not an identical API to `context.Context`.

## Reproduce verification

Rust commands, from the repository root:

```bash
cargo fmt --manifest-path server-rust/Cargo.toml --check
CARGO_BUILD_JOBS=2 cargo test --locked --manifest-path server-rust/Cargo.toml
CARGO_BUILD_JOBS=2 cargo clippy --locked --manifest-path server-rust/Cargo.toml --all-targets -- -D warnings
CARGO_BUILD_JOBS=2 cargo build --locked --manifest-path server-rust/Cargo.toml --release
```

The two-job setting bounds local build resource use; it is not a runtime tuning claim. Dependencies pin Ohkami `0.24.9` with `rt_tokio` and Turso `0.8.3`, matching the Go engine version. `Cargo.lock` fixes the resolved dependency graph. Turso's unused default features are disabled; identical engine versions do not imply identical SDK/build settings.

Run the unchanged Go baseline from `server/`:

```bash
go test -count=1 ./...
go test -race -count=1 ./...
```

From `server-rust/`, check the exact Go reference used:

```bash
sha256sum -c GO_REFERENCE.sha256
```

The manifest covers 14 Go source/test files plus `go.mod` and `go.sum`. **Those Go files were pre-existing uncommitted work when this candidate was created**; this work does not commit or rewrite them. Reproducing the same comparison in another checkout requires that same Go snapshot, not just the Rust commits.

### Observed verification — 2026-10-25

| Check | Result |
| --- | --- |
| Full debug Rust tests | 31 passed: 16 private storage, 1 CLI, 3 core, 2 HTTP, 3 typed repository, 6 transaction tests |
| Formatting / Clippy, all targets with warnings denied | Passed |
| Native release build | Passed |
| Actual release executable, `--port 0` | 7 HTTP checks passed; loopback-only OS listener verified; external-bind argument rejected; owned process stopped with exit 0 |
| Unchanged Go tests / race detector | Passed |
| Go reference hashes | 16 / 16 matched |

Regression evidence includes two initially failing cancellation cases (orphaned `BEGIN`, discarded cleanup state) and two initially failing date cases (arbitrary separator, silently normalized leap second). Each was reproduced before its fix. Independent read-only persistence review found the date issue; no additional repository/transaction blocker was identified.

To repeat the release HTTP check manually, run the built executable instead of `cargo run`:

```bash
./server-rust/target/release/auth-rust-comparison --port 5051
```

Use the same `curl` check above. Also verify that `GET /`, `/users`, `/users/u`, `/api/session`, `/api/auth/get-session`, and `POST /healthz` return 404 without cookies. Stop only that diagnostic process with Ctrl+C.

## Boundaries and remaining work

- No login, OAuth, magic links, passkeys, 2FA policy, session API or encryption/decryption was implemented. Opaque values are stored unchanged; repositories generate no IDs or timestamps. The existing application API remains Astro + Better Auth.
- No production database/schema compatibility test, file migration, remote sync, deployment or Cloudflare/WASM target is included.
- Cancellation tests prove callback abort/panic, scope closure and deterministic cleanup boundaries. Interruption during native OS I/O and injected commit/rollback failures remain unproven.
- This is one deliberately serialized native connection, not a connection-pool or concurrent-worker scalability comparison. Rust types prevent some invalid inputs Go rejects at runtime; tests are not a proof of every parser/SDK edge case being identical.
- Ohkami's no-network test helper is debug-only in this pinned version. Use the debug test suite and the actual release executable for release smoke checks, not `cargo test --release` as an equivalent test path.

Approved scope: [design](../docs/superpowers/specs/2026-10-25-rust-ohkami-comparison-design.md). Work units and verification record: [implementation plan](../docs/superpowers/plans/2026-10-25-rust-ohkami-comparison.md).
