# Internal Go authentication persistence CRUD

Build an additive Go persistence package for the existing authentication data contract. This first delivery provides tested CRUD, not a replacement authentication server. The user approved internal persistence first; HTTP endpoints remain out of scope.

## Boundaries

- Add a separate module under `server/`; leave Astro, SvelteKit, Better Auth, existing package scripts and deployment configurations unchanged.
- Use `database/sql` with an injected connection. The package never opens a database, reads environment variables, loads credentials, runs migrations or alters schemas.
- Run tests only against freshly created in-memory SQLite databases containing fictional records. Fixture DDL belongs exclusively to tests.
- Treat the installed Better Auth 1.3.34 adapter audit as a logical storage contract, not proof of the physical production schema.
- Preserve the current DB engine and schema. No real DB access or production compatibility claim is part of this delivery.

## Architecture

`server/internal/authstore` owns model mapping, value conversion, parameterized SQLite CRUD and explicit transactions. The caller supplies the database connection and an allowlisted schema registry. No production driver or connection configuration is selected here. `modernc.org/sqlite` is imported only by tests to exercise actual SQLite statements without CGO or external services.

A registry maps logical model names and fields to physical table and column names, field kinds and nullability. It must identify one string primary-key field for every model. Constructor validation rejects invalid identifiers, duplicate physical mappings, missing primary keys and unknown field kinds. Copy registry data so caller mutation cannot change the validated allowlist.

Synthetic fixtures cover `user`, `session`, `account`, `verification` and `twoFactor`. Their registry is test data, not a default production configuration. Additional plugin models can be registered explicitly later; do not infer tables from `src/db/schema.ts`.

## CRUD contract

| Operation | Behavior |
|-----------|----------|
| `Create(ctx, model, record)` | Insert explicitly supplied fields; require a nonempty string primary key. Return an error on failure. Database defaults remain database-owned. |
| `Get(ctx, model, id)` | Select registered fields by primary key; return a decoded record or `ErrNotFound`. |
| `Find(ctx, model, filter, limit, offset)` | Equality predicates combined with AND, deterministic primary-key ordering and bounded pagination. Empty filters are allowed only for reads. |
| `Update(ctx, model, id, patch)` | Update explicitly supplied fields of one primary-key-selected record. Reject empty patches and primary-key changes. Return `ErrNotFound` if no row matches. |
| `Delete(ctx, model, id)` | Delete one primary-key-selected record; return `ErrNotFound` if no row matches. |
| `Transaction(ctx, callback)` | Bind a child store to a real `sql.Tx`; commit only on successful callback, roll back on callback error or panic, and propagate cancellation and commit errors. Reject nested transactions explicitly. |

`Create` does not return a fabricated copy of the inserted row: callers needing database-generated/default values call `Get`. `Update` and `Delete` use affected-row counts, not the audited JavaScript adapter's `result.length` behavior. This is an explicit Go persistence interface, not a drop-in implementation of Better Auth's adapter API.

Use `?` parameters for every record value, ID, filter value, limit and offset. Resolve identifiers only through the validated registry and quote them. Sort map-derived columns and predicates for deterministic statements. Never accept raw SQL, table names or column names through operations.

Pagination defaults to 100 rows when limit is zero, caps requests at 1,000 rows and rejects negative limits or offsets. Missing fields in a record or patch remain omitted; explicit `nil` means SQL NULL and is accepted only for nullable fields. Equality with `nil` compiles to `IS NULL`, not `= NULL`.

## Value compatibility

| Logical kind | Stored value | Read value |
|--------------|--------------|------------|
| String | Go string, unchanged | Go string |
| Boolean | Integer `0` or `1` | Go bool; reject other stored values |
| Date | UTC ISO text with exactly millisecond precision, matching JavaScript `Date.toISOString()` | Go `time.Time`; reject invalid stored dates |
| Number | Finite numeric value | Numeric value; do not claim arbitrary-precision integer fidelity with JavaScript |
| JSON | JSON text using Go's JSON encoder | Decoded JSON; reject invalid stored JSON |

Date writes accept `time.Time`, normalize to UTC and truncate sub-millisecond precision. Database text may arrive as `string` or `[]byte`; support both. NULL must not silently become false, an empty string or a zero date. Reject incompatible Go input types before executing SQL.

Do not automatically decode JSON contained inside a logical string field: `verification.value`, encrypted secrets, backup-code ciphertext and provider tokens stay opaque strings. JSON encoding is semantic compatibility, not byte-for-byte JavaScript serialization. Never hash, encrypt or rewrite these values in the persistence layer.

The caller owns ID generation, timestamps, plugin defaults and authentication policy. No automatic `createdAt`, `updatedAt`, `twoFactorEnabled`, expiry or secret changes belong in this unit.

## Errors and ownership

- Validation errors identify the operation/model/field, never record values or SQL arguments.
- `ErrNotFound` remains distinguishable with `errors.Is`.
- SQL and decoding failures are returned, not treated as successful empty results; close rows and check iteration errors.
- Preserve context cancellation. Do not close a caller-owned DB or retry writes automatically.
- A transaction callback uses its child store for every operation; it must not fall back to the outer DB connection. Rollback must run during panic unwinding before the panic propagates.
- Transactions provide an explicit primitive, not a claim that magic-link or 2FA consumption is already secure or atomic.

## Files

| Path | Responsibility |
|------|----------------|
| `server/go.mod`, `server/go.sum` | Separate Go module and pinned test-driver dependency |
| `server/internal/authstore/schema.go` | Registry types, validation and defensive copying |
| `server/internal/authstore/codec.go` | Storage encoding and decoding |
| `server/internal/authstore/store.go` | CRUD, query construction, row scanning and transactions |
| `server/internal/authstore/*_test.go` | Test-only DDL, fictional fixtures and behavioral regressions |
| `server/README.md` | Internal usage, isolated test commands and remaining integration boundaries |
| `odd/tasks/go-auth-crud.md` | Bounded delivery tracker and observed verification evidence |

## Acceptance

1. Observe failing tests before implementing each behavior. Exercise actual SQL against in-memory SQLite, not just mocked query strings.
2. Demonstrate create/read/find/update/delete on all five fictional models, custom table/field aliases, nullable values, database defaults and opaque verification/2FA strings.
3. Check boolean/date/number/JSON round trips and malformed input/stored values. Compare date fixtures against JavaScript ISO output without initializing Better Auth or loading project environment files.
4. Reject unknown models/fields, malicious identifiers, primary-key mutation and invalid pagination. Prove SQL-looking values remain inert data.
5. Prove commit, callback-error rollback, panic rollback, nested-transaction rejection, uniqueness errors and cancellation. Verify missing-row behavior and deterministic ordering.
6. Run `go test ./...`, `go test -race ./...`, `go vet ./...` and formatting/diff checks from `server/`. Record commands and observed outcomes, including any unavailable checks.

## Explicit exclusions and next boundary

No HTTP API, Goth/OAuth wiring, cookie/session engine, magic-link delivery/consumption, 2FA enrollment/recovery/enforcement, SSO, frontend integration, real-schema inspection, deployment or production writes. Those features remain required in the broader migration; this adapter does not establish their parity.

Before real integration, separately authorize a metadata-only check of the existing DB and map its actual tables/columns. A mismatch must stop integration, never trigger a schema migration. Select and test the existing-engine Go connection driver at that later boundary.

## Evidence

- Approved scope: internal Go CRUD with isolated tests, API deferred (Engram observation 5349).
- Recovery handoff: Engram observations 5338 and 5339.
- Installed adapter audit: observation 5325; feature/schema boundary audit: observation 5322.
- Current Go toolchain verified as `go1.26.2 linux/amd64`.
- Current `database/sql` and test-driver APIs checked through Context7 against Go source and `pkg.go.dev/modernc.org/sqlite`.
