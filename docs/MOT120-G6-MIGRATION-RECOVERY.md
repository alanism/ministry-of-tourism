# MOT-120 G6 migration and recovery — local evidence

Tested code: `de02965b2672068553af606e39e00a9ffac6b9f1`. Baseline: `3caf1cba72e4bfc72cd10926c7201ae5f9eb0cb4`. Actual implementation model: `muse-wonder-1.0` (16 retained call receipts). Muse Wonder orchestrated, reviewed, corrected generated-output integration issues, and executed checks. This is self-check evidence, not independent Muse Wonder implementation acceptance.

## Delivered

- Schema 3 activates the approved optional card dimensions/stack and board-only asset surface. The 10,000-unit board extent, existing lane ordering and magazine geometry semantics are retained. Native package envelope stays version 2. Both native binary and readable legacy metadata use strict version-specific validation.
- Legacy v1/v2 geometry that fits migrates on a detached document. Invalid geometry refuses normal loading and retains original bytes. The readonly inspector never relabels a legacy document to make it readable. Unknown/future/corrupt data offers original backup without editable recovery.
- Recovery previews explicit x/y changes for all and only offending cards. Other content, IDs, scope, source, assets and magazine placements are retained. Cancel/discard invalidates the preview. Original ZIP downloads are byte-exact; raw document/update-sequence downloads explicitly exclude image files. Legacy native export reports missing media and enforces the existing 10 MiB/file and 50 MiB/package limits.
- Store precedence is accepted repair pointer, then v3, v2, unversioned. Any present-invalid/unreadable selected candidate stops; older copies require explicit selection. Missing accepted copies are reported and older candidates remain available for inspection.
- Accepted repairs use fresh named stores. Native IndexedDB staging resolves only after transaction commit, closes, and reopens for schema/identity/snapshot validation. Pointer publication uses an atomic compare-and-swap; named-source validation holds a readonly source transaction through publication, serializing concurrent source writes after pointer commit. Failed candidates and original stores are retained, never merged or deleted. No automatic cleanup is added.
- Recovery has no TripSession/agent API. Schema-3 board placements do not leak into magazine/keepsake presentation consumers; native backups retain both surfaces.

## Verification

`npm run check`: **1,109 tests / 169 files**, four TypeScript projects passed. Vitest 33.88 seconds; targeted loops approximately 1–2 seconds. Production web build passed, with existing bundler size/timing advisories unchanged.

The 1,014-test baseline is preserved apart from exactly two owner-authorized expected-version assertions: `integration-state.test.ts` and `trip-store.test.ts`, `.toBe(2)` → `.toBe(3)`. Owner: **“Allow only those two version-expectation updates.”** Every other existing test assertion, timeout, worker setting, configuration, dependency and lockfile is unchanged. Added **95 tests** (69 core, 26 web). A destination-details helper now declares just the four metadata fields it consumes; its existing schema-2 fixture remains unchanged and strict persisted-document validation remains schema 3.

Real Chromium checks use fresh isolated browser contexts, fictional data and loopback resources; external requests are blocked:

1. Refusal → readonly inspection → byte-exact raw backup → legacy ZIP validation → preview → cancel without pointer → accept → reload with private text and original source bytes unchanged.
2. 390px viewport: no horizontal overflow; ordinary scrolling reaches Accept (not merely Playwright scrollIntoView); discard clears preview.
3. Actual stored source changed after preview: refusal, no accepted pointer.
4. Missing image bytes: honest legacy-export refusal.
5. Imported legacy ZIP: byte-exact original backup and successful repair/adoption.
6. Invalid ZIP: original backup only, no repair.
7. Missing accepted copy: no silent fallback; explicitly selectable older copy.
8. Cross-tab race injection in actual `persistRepairedTrip`: before fix order was source-write → pointer; after fix pointer → queued source-write.
9. Native repair-write abort: before fix timeout plus uncaught AbortError; after fix clean rejection, no pointer, fresh successful retry, no page errors.
10. Cancellation while pointer publication is pending: rejects, no accepted pointer, no page errors.

## Retained failures and model corrections

RED evidence is retained for store discovery (3 failures), core migration/recovery (23 failures), hardening (8 failures), browser storage (18 failures), surface leakage (3 failures), accepted-pointer legacy relabel, missing recovery UI, phone clipping, missing-copy candidate listing, source publication race and native save abort. These are regression evidence, not unrecorded discarded runs.

Rejected Wonder drafts confused default card size with board extent, proposed deleting a probed missing database, added unnecessary crypto fallbacks, labelled a first corrupt update as a whole backup, and proposed a source-text/duplicate-logic browser test instead of exercising the actual function. Muse Wonder supplied correction prompts, rejected that test, added native browser failure injections, and repaired generated output paths/encoding plus the existing-reader/migrating-reader distinction. The prompts, responses and receipts remain in the local evidence directory. No claim that the model itself ran checks.

Failure replay date: **2027-04-30**. Re-test the retained rejected drafts and native failure cases against the then-current unchanged harness; compare empirically before considering any pattern reusable. No automation was created.

## Remaining holds and scope

MOT-120 remains **In progress**. This slice delivers schema/migration/recovery; the main free-board drag, resize, clipboard, duplicate, input affordances and related Undo/UI integration are not implemented here. A numeric recovery form is not the free-board product experience. Actual iPhone/iPad, physical touch, performance and independent human/implementation acceptance remain outstanding. The 390px Chromium check does not clear device holds.

MOT-131 owner/Muse Wonder G1–G6 contract approval is preserved, not represented as acceptance of this implementation. Existing broader task-definition, MOT-130 privacy, production/provider, coverage, release and PDF holds remain unchanged. No PDF generation, deployment, push, FCC repository edit or production setup change.

Local evidence: `Design Sprints/MOT120-Wonder-G6-2026-10-31/`. Repository mirror: `docs/evidence/mot120-g6/` (selected receipts, results, logs and screenshots). All source work and integration stay local.

Canonical candidate recheck at `4112749`: all 1,109 tests and four TypeScript projects pass (33.29s Vitest). The evidence hash manifest hashes Git blob bytes so Windows CRLF conversion does not create false mismatches. Raw local output hashes are retained separately in the planning evidence directory.
