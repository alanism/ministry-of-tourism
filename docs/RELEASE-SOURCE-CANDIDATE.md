# MOT-101 public source candidate — 31 October 2026

This branch prepares source for review. It does not authorize a deployment or
claim release acceptance. MOT-101 remains Doing; assigned reviewers and owner
approval, device, real-origin and rollback requirements remain in force.

## Integrated source

The base is completed WP8/WP9 `39751c360963bab4e22df7f162994ddcccf75ae1`
from `mot-content-cards`. Published app follow-ups from `mot-wp3-art` at
`84dc9a33cd46f03f340843b612a8dabc794e45a1` are applied as source patches:

| Source revision | App behavior carried forward |
|---|---|
| `e865b7d` | Included destination list, offline aliases, keyboard visibility, single-flight trip creation |
| `953ae5c`, `3221e1b` | Grounded Ask Muse, selected proposals, readable source rows and phone layout |
| `f119608` | Explicit runtime recovery, safe diagnostic receipts, durable Test adapter attribution |
| `60ab751` | Bounded city feed/body settlement and retained dated source recovery |
| `fff0342` | Removed native export artifacts stay removed during asynchronous restoration |
| `10ad7bd` | Existing source cards/freshness/Almanac integration and scoped Muse source budget |
| `3507a8a`, `84dc9a3` | Almanac settlement and cancellation while city/Almanac cache reads are stalled |

The MoT root-entry fix and unchanged browser regression are carried from the
already committed `92c478f` implementation: `/` opens the travel workspace,
advertises the trip agent contract, creates an empty trip and reopens its durable
board without a query string or hidden Writer API/database. Explicit inherited
`view=board` and `view=agent` entry points retain their existing route selection.
Vite's inline-note input now uses the trip contract; compiler/server constraints,
tests, dependency/lock files and thresholds are unchanged.

Shared-component resolutions retain current WP8 group controls, WP9 guidance,
Today adaptation and memory workflows, original source annotations/JSON handling,
privacy-safe city scoping, and the new Muse recovery/attribution. `recoverFccTitle`
is retained alongside the cache fixes. Public history contains no private Git
history, account binding, private journal or credential.

The closed PDF patches `e9e7038`, `ed1c198`, `52b20ec` and their PDF-specific
checks were not taken. Existing magazine/PDF source is byte-identical to the base.
The artifact restoration change is shared native-file lifecycle behavior. No PDF
generation or new PDF feature, timing or visual work was performed. Existing
legacy unit tests still run as part of the ordinary suite.

These are source integrations, not Git ancestry claims for the original private
or FCC producer revisions. Do not merge unrelated product history or manufacture
an ancestry pass to satisfy the release checker.

## Mechanical checks

Fourteen unchanged incoming regression files ran before source integration:
43 failures and three passes. After integration all 46 pass. The root browser
regression fails against the old default Writer route, then passes on development
and production builds at 1440 and 375 pixels.

The ordinary `npm run check` was run: **817/818 tests pass**, with the unchanged
five-second all-catalog timeout also reproduced on the WP9 baseline. Two-worker
and four-worker complete runs retained that same failure; the two-worker run
took 79.98 seconds, four workers 47.32 seconds. No timeout/isolation/assertion was
changed. An explicit execution partition then checks every one of the **148**
test files once: the other **147 files / 813 tests pass** in 32.16 seconds with
four workers, and the catalog's **one file / five tests pass** alone. All **818**
tests therefore pass across these complementary batches; the default command's
failure remains a reported limitation. All four TypeScript projects and the
production web build pass. Existing chunk-size/plugin timing advisories remain.

All **152** protected baseline test/configuration/magazine/PDF files and all
14 incoming regression files remain byte-identical. The root browser script
matches its existing committed implementation. No dependency, schema or harness
threshold was changed by this integration.

## Browser verification

Sandboxed Chromium via bundled Playwright; Browser plugin not available. Tests
use isolated synthetic trips. Provider responses in Muse tests are explicitly
labelled transport fixtures; no paid/live model or credential is used.

- The unchanged real WP8 runner passes response JSON/ZIP exchange, explicit sender
  resolution, current/partial/conflicting/higher revisions, exact 60-point tally,
  fairness 36/four first choices versus points-first 43/three, selective Apply/Undo,
  access/deadline attention, stale/malformed refusal, native persistence and a
  fresh touch-context personal ZIP import offline after preload.
- The unchanged native WP9 runner passes explicit-ledger routing/privacy,
  optional answers, narrow edit/persist/Undo, guide GET/version/byte parity,
  real dated Today adjustments, protected bookings, memory reactions, credited
  sandboxed HTML originals, native offline recovery and deliberate storage/media
  fault recovery. Only expected AbortErrors appear in the injected fault window.
- The destination runner passes 30 state/width checks, empty/single-flight
  creation, seven unchanged source cards, board switching and included-list
  offline creation. Muse grounding passes 48 state/width checks with selected
  Apply/Undo and stale/Stop handling. Runtime provider-error, Stop, Test adapter
  reload attribution and Off fixtures pass across six widths per state.
- Stalled cache UI recovery settles in 20,329 ms, retains dated content/cache and
  revision, ignores late values, and allows retry/reload. Direct city/Almanac
  cancellation settles in 0–0.1 ms online/offline. No timeout is added to storage.
- Root-entry smoke passes on the built app at 1440/375 without a query string,
  hidden Writer API/database, page errors or document overflow. Screenshots of
  root, phone Today and Muse recovery were inspected.

Normal WP8/WP9, root and cache runs have no page/console/provider failures. The
root RED capture's inherited Writer warning and intentional storage-fault errors
are retained separately. Physical iOS/Safari, cold offline startup, new live Muse
calls, independent design/model reviews, production FCC smoke and preview rollback
were not exercised by this source-only task.

## Release hold and reproducible commands

The unchanged release checker self-test passes. Against the frozen canonical
plan, the base has 53 live-mode errors (20 absent-ancestry task records) and 51
manual-mode errors (19 absent-ancestry records). Status acceptance, open findings,
guide/live setup, source ancestry and approval must be assessed from the actual
board; an Implemented card is not accepted by this gate. The checker is legacy:
its numbered loop covers A01–A14, while MOT-101 also requires applicable A16–A20.
Those additional requirements are not waived. The checker was not modified.

```powershell
npm run check  # Retain/report the existing default catalog timeout if reproduced.
node node_modules/vitest/vitest.mjs run --maxWorkers=4 --exclude apps/web/src/artwork/catalog.test.ts
node node_modules/vitest/vitest.mjs run apps/web/src/artwork/catalog.test.ts
npm run typecheck
npm --prefix apps/web run build
node scripts/check-mot-release.cjs --self-test
node scripts/check-mot-release.cjs --plan <canonical-plan> --revision HEAD
```

For browser scripts set `MOT_PLAYWRIGHT_MODULE`, `MOT_APP_REPO`,
`MOT_TEST_ORIGIN` and an external `MOT_EVIDENCE_DIR`. Run
`test-mot-group-preferences.cjs`, `test-mot-wp9-native.cjs`,
`test-mot-destination.cjs`, `test-mot-muse-grounding.cjs main`,
`test-mot-muse-runtime.cjs <provider|stopped|test|off>` and `test-mot-root.cjs`
from `scripts/`. Restart the owned Vite server after integration before module
injection/offline probes; root smoke also runs on the production preview.

Local canonical evidence is `Design Sprints/Build-MOT-101-Public-Source-2026-10-31`
in the planning workspace. Spark builder cards, MOT-94, PDF closure, FCC and Writer
repositories, live deployments and guide URL remain untouched. Account bindings
stay outside this public source checkout. A later deployment requires the existing
owner authorization and release checks; a local preview is not a deployment.

Re-test the retained catalog contention and unverified device/cold-offline/live
boundaries on 30 April 2027. This note does not create an automation.
