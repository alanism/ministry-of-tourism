# Project scripts

Run scripts from the repository root. Most browser checks assume a running local web app; room checks additionally need the fixtures and emulators named in their source.

| Group | Purpose |
| --- | --- |
| `build-fcc-*.mjs`, `build-public-fcc-catalogue.mjs` | Generate tracked FCC catalogue data |
| `audit-mot-fcc-coverage.mjs`, `verify-public-fcc-catalogue.mjs` | Inspect catalogue coverage and contracts |
| `build-trip-guidance.ts` | Generate the public guide from the core guidance source |
| `*.test.mjs` | Node unit tests for tooling; commands in the [development guide](../docs/DEVELOPMENT.md) |
| `test-mot-*.cjs` | Browser, integration and boundary checks with task-specific fixtures |
| `verify-room-*.mjs`, `verify-room95-*.mjs` | Shared-room emulator and integration checks |
| `measure-mot-*.cjs`, `prepare-mot-performance-fixture.mjs` | Performance measurements and fixtures |
| `check-mot-release.cjs` | Inspect release evidence against the supplied Kanban and revision |
| `record-demo.mjs` | Historical October demo recording workflow |

Script files and their existing assertions remain the evidence for their named scope. A historical script may require the original local fixtures; it is not automatically part of `npm run check`. Generation, network audits and emulator tools can write output or contact services, so use the command appropriate to the task.
