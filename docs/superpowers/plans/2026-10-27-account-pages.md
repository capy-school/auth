# Account Pages A Implementation Plan

The approved scope is documented in ../specs/2026-10-27-account-pages-design.md.
This commit series keeps existing authentication configuration and storage intact.

## Delivery progress

- [x] Shared shell, dashboard and active sessions
- [x] Passkey management
- [x] API key management
- [ ] Server-verified two-factor management
- [ ] Organization management

Each delivered unit includes SSR, browser and isolated server-contract checks.
Exact test/build receipts are recorded in each commit body. Existing settings routes
retain their previous implementation until their feature is migrated. Shared account
styles and transport fixtures form the initial reusable base; later units add their
own controller, route, rendering branch and tests.

Rollback a feature together with its AccountPage wiring and matching tests, not
unrelated authentication factories or another feature. Go/Rust work is out of scope.
