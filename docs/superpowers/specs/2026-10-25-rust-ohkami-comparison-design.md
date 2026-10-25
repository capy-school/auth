# Local Rust + Ohkami comparison of the existing Go persistence

Create an additive `server-rust/` candidate that mirrors the Go authentication persistence contracts. Use native Ohkami with Tokio for a loopback-only diagnostic server. Keep Go, Astro, SvelteKit, production infrastructure and the existing database unchanged.

The user approved **local comparison**, not a Cloudflare/WASM port. Neither the Go reference nor this Rust candidate is a working authentication service.

## Scope

| Included | Excluded |
| --- | --- |
| User, session, account, verification and two-factor domain values | Login, OAuth/Goth, magic links, 2FA policy, passkeys or SSO |
| Typed CRUD and the same targeted lookups as Go | Public CRUD endpoints for authentication tables |
| Validated physical mappings, codecs and parameterized Turso SQL | Guessing the production schema or opening the production DB |
| Transaction-bound repositories and rollback/error tests | Deployment, Cloudflare Workers/WASM, remote sync or replicas |
| Ohkami diagnostic route and native executable | Replacing the existing Astro/Better Auth API |
| A documented, test-backed parity matrix | Unsupported language/framework throughput or memory claims |

## Architecture

Dependencies point inward. Ohkami and Turso are outer adapters, not application policy.

- `domain`: plain Rust values matching the five Go models. Dates use a general-purpose UTC-capable time type, not database SDK types. No Ohkami, SQL, Turso or persistence serialization tags.
- `application`: repository traits, pagination, errors and unit-of-work contract. Async futures are part of the language boundary; framework requests/responses and SQL records never cross it.
- `infrastructure/turso`: owned validated schema metadata, private codecs/record mapping, SQL operations and transaction implementation. The caller injects an already-created connection; construction does not open, query, create or migrate a database.
- `http`: Ohkami diagnostic DTO/route only. No authentication tables or secrets are exposed and no database is opened by the HTTP binary.
- `main`: wire the diagnostic app and bind only `127.0.0.1`, default port 5051, with an optional numeric `--port`. Do not load `.env` files or accept a database URL.

Architecture acceptance is the Dependency Rule, tested with module/import checks and compiling the repository ports independently of HTTP. Do not give an implementation score before code exists; target 10/10 on separation, not a claim of production readiness.

## Versions and local engine

- Pin Ohkami to `0.24.9` with `rt_tokio`, verified against its published API and no-network testing support.
- Pin the native `turso` crate to `0.8.3`, matching the Go SDK's engine version. Disable unused default FTS/custom allocator features; this is a CRUD comparison, not a benchmark of identical build flags.
- Use Tokio, `serde_json` in storage/HTTP, and a time library with extended-year support. The Go date codec accepts JavaScript Date's full TimeClip range, so a date library restricted to four-digit years is insufficient.
- Commit the application `Cargo.lock`. Keep generated `target/` output inside `server-rust/` and ignored there. Do not change Node dependencies or the Go module.
- Published source is the authority if rustdoc is unavailable: docs.rs failed to generate Turso 0.8.3 documentation, but the crate source is accessible. Compilation must be verified locally rather than inferred from that failure.

## Storage parity

1. Preserve all Go model fields, optional values and opaque token/encrypted-secret strings. Never encrypt, decrypt, normalize, generate IDs/timestamps or supply authentication policy in the repository layer.
2. Preserve explicit logical-to-physical table/column mappings. Validate ASCII identifiers, case-insensitive duplicate tables/columns, supported kinds and a non-null string primary key. Freeze metadata so caller mutation cannot redirect later SQL.
3. Match string, nullable, boolean 0/1, finite number, JSON and UTC ISO date storage. Format dates at millisecond precision, including signed six-digit years and JavaScript TimeClip bounds. Reject malformed stored values instead of silently coercing them.
4. Parameterize values; allowlist and quote identifiers. Treat hostile-looking strings as inert values. Preserve missing-record errors, bounded ID-ordered reads, default limit 100, maximum 1000 and rejection of negative pagination.
5. Preserve typed CRUD for all five entities, email/token/provider-account/identifier/user lookups, and non-unique lookup errors. Do not expose the private generic record store as an HTTP API.

Rust's type system may prevent inputs that Go rejects at runtime. Record those differences rather than manufacturing unsafe inputs to claim identical APIs.

## Transactions and cancellation

Share one injected connection through `Arc`, not the SDK's `Connection::clone`. Serialize root operations with a Tokio mutex; transaction-bound repositories use the same connection while the transaction owns that gate. Reject nested transactions before waiting for the gate.

The unit of work supplies transaction-bound repository handles, commits only after a successful callback, and rolls back callback/constraint errors. A scope guard invalidates escaped handles on every exit, including panic and cancellation. Escaped handles must fail rather than use the root connection.

Turso 0.8.3's transaction destructor defers rollback until the next access to that connection. After a panic or dropped transaction future, the next root operation must first trigger that pending rollback on the **same** connection. Test that no partial writes become visible and the connection remains usable. This cleanup timing differs from Go's synchronous deferred `sql.Tx.Rollback`; document it explicitly.

Rust future cancellation is not an identical `context.Context` API. Test callback-future cancellation and rollback, and distinguish this from unproven cancellation during a native I/O step. No parallel-worker performance claims follow from a deliberately serialized comparison connection.

## Ohkami boundary

Expose only `GET /healthz`, returning fixed diagnostic JSON that identifies the Rust candidate and explicitly reports authentication/storage integration as absent. Add `Cache-Control: no-store`; do not return model records, cookies or generated credentials. Other application/API paths remain absent. The route demonstrates Ohkami wiring, not database or authentication readiness.

Keep the public diagnostic response separate from domain types. Test it through Ohkami's no-network tester, then smoke-test the actual loopback executable. A green health endpoint alone does not prove persistence parity.

## Verification and comparison

- Capture a source-hash manifest of the Go reference files used for comparison; those files are currently uncommitted user work. Recheck it at completion without altering or staging Go files.
- Mirror Go's lifecycle, lookup, mapping-validation, NULL/number/date/JSON, inert-SQL and pagination scenarios against independent in-memory Turso fixtures. DDL is confined to synthetic test setup.
- Test commit, rollback, constraint failure, panic, dropped callback future, nested transactions and escaped transaction handles against the actual engine, not a mocked SQL driver.
- Verify Ohkami's response, no cookies, no exposed auth CRUD and the real binary's loopback behavior. No production endpoints are called.
- Run `cargo fmt --check`, Rust tests, `cargo clippy --all-targets -- -D warnings` and a release build. Re-run the unchanged Go test suite, including `-race`, for the comparison baseline.
- Document commands, observed results and limitations in `server-rust/README.md`, with a side-by-side parity matrix. Do not compare Rust HTTP throughput against a nonexistent Go HTTP server or report build times as request latency.

## Delivery

Work inline in the existing feature checkout, following the user's established preference. Use separate reviewable work units for core contracts, schema/codecs, typed persistence, transactions, and Ohkami/comparison verification. Keep tests with the behavior they prove, report real diff sizes rather than compressing code, and never include the existing staged Go work in commits.

No frontend work is included while this comparison is active. The static SvelteKit checkpoint `4fef06a` remains unchanged; evaluating `/` and the dashboard is deferred, not removed.
