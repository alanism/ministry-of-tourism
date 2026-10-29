# WP2 combined verification

This checkout combines the existing destination command/picker, current full-issue adapter and Ask Muse with committed source-card/cache/Almanac work from `51c51005ae1e63eac226ac49d68664396d5d28ec`. The shell preserves the newer art upload/Undo, Muse ghosts/runtime controls and Test adapter authorship. Freshness and grounding are scoped to board and city. Spark's four Almanac files are imported unchanged; its builder assignment is retained.

Run `npm run check`, all four type projects and the web build. Do not weaken the catalog deadline if parallel worker contention recurs; retain that failure separately and run the complete one-worker suite with the same assertions.

Start a fresh local Vite instance. Set `MOT_TEST_ORIGIN`, `MOT_PLAYWRIGHT_MODULE` and an external `MOT_EVIDENCE_DIR`. Use a fresh server after source edits when checking diagnostics; HMR can leave a previous module instance in an already-created adapter. Run each bounded probe separately:

- `node scripts/test-mot-destination.cjs`: 30 state/width cases, keyboard, empty creation, seven-source preservation, board switching and included-index preloaded offline operation.
- `node scripts/test-mot-content-cards.cjs`: locked publisher text, separate notes and checked facts, safe links/inert HTML, Undo, keyboard/phone detail sheet.
- `node scripts/test-mot-fcc-states.cjs`: pending/stale/offline copies, three attempts, changed-source badge without overwriting notes, cross-city refusal, HTTP 304 dates and public-only diagnostics.
- `node scripts/test-mot-fcc-cache-recovery.cjs`: real browser storage recovery, versionchange/deletion and failed-write retention, with unrelated storage preserved.
- `node scripts/test-mot-almanac.cjs`: per-item vintages/citations, pin/Undo, comparison, failed-refresh retention and preloaded offline operation. Set `MOT_ALMANAC_FIXTURES` to the captured public city snapshots; the probe states their dates.
- `node scripts/test-mot-muse-grounding.cjs <mode>` for `main`, `catalogue`, `off`, `injection`, `source-failure`: labelled transport fixtures, selected-city bodies, private/unselected exclusions, cited selective Add/Undo and stale/cancel refusal; no provider call.
- `node scripts/verify-mot-fcc-live.mjs`: read-only current public feed sweep, full body/provenance/hash checks and four cache reopens. Direct output outside the checkout.

The external WP2 evidence also contains a before/after surface probe and real destination deadline probe. `source-integration.test.ts` prevents attribution regressions; `destination-settlement.test.ts` prevents unbounded registry waits. Existing schema, command, source-integrity, privacy and grounding tests remain unchanged.

These are builder checks, not independent Opus design acceptance or physical iOS/Safari certification. No Hosting deployment, paid model call or credential handling is required. Cards remain at their existing Complete/Implemented status, and the kanban records the exact combined revision, results and outstanding design holds.
