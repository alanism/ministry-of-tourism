# MOT-131: G1–G6 owner decision review

31 October 2026. **Recommendations only; all six owner decisions and the requested Astra review remain pending.** This Codex review supplements the Muse Wonder proposal, rather than silently revising its pinned examples. It is not an Astra review or implementation authorization. Source inspected: `53e58be39626ebcfdf26da93a2ec90b3936bbb5f` (tested implementation `80ff1117a01044e4162f0baa7ff24c65c7ecb677`).

Primary proposal: [MOT131-BOARD-GEOMETRY-PROPOSAL.md](MOT131-BOARD-GEOMETRY-PROPOSAL.md). The owner is being asked to approve the following concrete package, or identify decisions to revise. Production, device, privacy, harness and PDF holds stay intact. No code or existing test is changed by this review.

## G1 — Where geometry lives: approve A

Keep card `x/y` as the sole saved card position. Reuse presentations for asset-only board placements, with an explicit board surface. Keep legacy presentations on the magazine surface. Do not add card-linked board placements or another canvas document.

This reuses commands, identity, privacy, media and Undo. Its cost is two record shapes; the implementation must derive one common rectangle for rendering/hit testing and explicitly route every reader/exporter by surface. Existing agent art restrictions remain in force: this does not authorize agents to create standalone board art.

**Owner choice:** A (recommended), B (one presentation per object with a larger migration), or C (separate canvas; not recommended without a demonstrated unmet invariant).

## G2 — Card footprint: approve optional saved size and stack

Approve `boardWidth`, `boardHeight` and `boardStack`. Keep the proposed defaults **1200 × 900** board units, minimum **400 × 300**, maximum **5000 × 5000**, and default stack **0** within **−1,000,000..1,000,000**.

Resizing changes the visible footprint, never truncates stored text or rewrites content. Opening a readable card view is local view state and does not resize the saved card. Those units are not screen pixels: fitting the whole board into a phone is an overview, not a claim that every card is readable there. Ordinary viewing and expanded reading must retain readable text and keyboard access; desktop/phone evidence remains required later.

**Owner choice:** resizable saved footprints (recommended), or fixed footprints with the same readable expansion. The limits are proposed contract values, not measured usability results.

## G3 — Space and layers: approve with stable stacking

Keep a **10,000 × 10,000** finite board, top-left origin, normalized asset coordinates mapped into that space, and local zoom/scroll. Keep cards and board images unrotated for this implementation; magazine rotation is unchanged. Keep image minimum dimensions of **100 × 100** units and require complete rectangles to fit the board. Preserve image/crop aspect when resizing; do not inherit the magazine's page-aspect conversion into the square board coordinate system. Reject an invalid new placement visibly without changing data.

**Revise the draft's tie-break rule.** Sort free-board paint order by `(globalStack, stableObjectKey)`, where the stable key includes the record kind and ID, compared deterministically without locale-dependent ordering. Do not use `x/y` as paint-order tie breakers. With the draft rule, dragging one of two equal-stack objects can unexpectedly put it above or below its neighbour.

Keep lane ordering separately unchanged as `(stage grouping, y, x, id)`. A free-board move may affect that existing derived ordering, but never changes stage/day/time/scope. Only explicit layer actions change stack. Label max-plus-one/min-minus-one operations **Bring to front / Send to back**; those are not one-layer steps. Overflow rejects without renumbering unrelated objects. Existing overlapping cards remain individually reachable through the lane view; migration does not silently auto-arrange them.

**Owner choice:** finite board, zero board rotation and stable layering (recommended), or revisit size/rotation before implementation.

## G4 — Duplicate/paste: approve with explicit graph authorization

Use narrow commands that preflight the complete operation, generate/remap IDs internally and commit one Undo step. Preserve permitted content, source evidence, credit, rights, crop and references. A copied card is a new object: do not copy booking status/reference, booking-attention authority, votes, ballots, group responses or live lineage authority. Same-board assets may be shared; cross-board records receive remapped IDs and may deduplicate bytes by hash. Privacy never widens.

**Required clarification:** enforce the existing actor/media/source/scope rules on the resolved source graph and destination before any write. The current session guards inspect particular command names and top-level `id/cardId/scope/currentFacts` fields. A new `sourceCardId` or nested `cards[]` command cannot rely on those generic checks catching everything. Do not let a new command bypass a restriction that the equivalent existing operations enforce. External clipboard claims never prove ownership or verified facts; MOT-130 still owns remote authority.

Leaving a board, cancelling or changing the initiating actor/context invalidates that pending operation even if the original board is selected again. Duplicate completion callbacks must not create additional objects. There is no durable exactly-once promise across reload.

**Owner choice:** approve these copy semantics (recommended), or name fields/behaviours that should differ. Any wider agent/privacy authority remains a separate held decision.

## G5 — Media work: approve bounded, all-or-nothing document insertion

Keep **5 items per gesture**, **1 image decode at a time**, maximum **8192 pixels on either side** and **16,777,216 pixels total**, checked from bounded headers before full decode. Preserve existing **10 MiB/file and 50 MiB/package** limits. The gesture cannot promise that an already populated trip fits the package budget.

PNG/JPEG/WebP/GIF/AVIF require a supported bounded header parser and validation; unsupported formats fail visibly with file/text fallback. Never execute clipboard HTML or fetch pasted URLs automatically. One invalid item aborts the whole document insertion; cancel/late completion releases transient media and creates no objects. Show separately whether the document is saved, image bytes are durable on this device, or bytes are only available in this tab.

At the pixel ceiling one RGBA buffer is **64 MiB**, before decoder overhead. These are bounded proposed limits, not proof of mobile safety or measured peak-memory acceptance. Keep the existing physical-device/performance gates.

**Owner choice:** approve these initial limits (recommended), or choose smaller limits before implementation. No existing harness cap is increased.

## G6 — Migration: approve only with recovery and store/version compatibility

Keep an explicit v2→v3 trip migration, unknown-version rejection before writes, legacy presentations interpreted as magazine, explicit surface routing, and preservation of private content/source evidence/media references. Filtered packages still do not promise Yjs or Undo history.

Retain refusal for out-of-extent coordinates/footprints: do not silently clamp, reorder or discard anything. **Refusal must leave a usable recovery path**, not only an error: retain untouched original data and provide access to an original backup plus a compatible read-only legacy inspection/export path. Any layout repair must show a preview and require the person's explicit acceptance. A repair workflow must be specified and checked before migration is considered ready; this review does not invent one as already implemented.

Two concrete compatibility requirements are missing from the first draft:

1. **Select the correct saved store.** `trip-store.ts:54–63` currently checks `:v${TRIP_SCHEMA_VERSION}` and then the unversioned store. A v3 bump alone can skip newer data in `:v2`. Discover and validate the applicable prior-version store before migration; never silently revert to an older snapshot when a newer store is present but invalid or unreadable. Preserve originals until the migrated copy is durably saved and reopened. Test unversioned + newer v2, v2-only, missing marker, failed/corrupt v3 and interrupted migration.
2. **Migrate both native representations.** `import.ts:65–76` loads the binary document, but its readable-JSON compatibility currently only rewrites a v1 schema marker to v2. A schema bump alone will not support v1/v2 readable packages. Define and test the whole supported import chain and both surface routes. Recommend keeping outer package version **2** only while its envelope stays unchanged; trip schema v3 supplies the rejection boundary. An envelope change requires a separate explicit version decision. This is a recommendation, not proof that round trips pass yet.

**Owner choice:** refusal with original-data recovery, correct store selection and tested package compatibility (recommended), or redesign bounds/migration before implementation. Approving an unexplained error that strands an old trip is not recommended.

## Disposition and implementation boundary

| Decision | Owner disposition | Requested Astra disposition |
|---|---|---|
| G1 | Pending | Pending |
| G2 | Pending | Pending |
| G3, including stable stacking revision | Pending | Pending |
| G4, including graph authorization | Pending | Pending |
| G5 | Pending | Pending |
| G6, including recovery and compatibility | Pending | Pending |

If the owner approves this package, record that actual approval and reconcile the original proposal to it. Do not call it Astra approval or clear MOT-131's independent review/build hold implicitly. Muse Wonder implementation remains downstream of the required dispositions. Required implementation evidence includes red/green tests for these invariants, unchanged harness checks, semantic Undo/Redo/reload, native round trips and the existing browser/device/privacy gates. This memo adds no test-budget relaxation, deployment authorization or production acceptance.

Current source anchors: `schema.ts:76–138`, `projections.ts:14–19`, `commands.ts:41–87/190–207`, `session.ts:73–94`, `persist.ts:14–36`, `package.ts:23–42`, `import.ts:49–98`, `trip-store.ts:53–71` and `trip-assets.ts:80–100`. The guard and migration observations concern how a future implementation could regress existing behaviour; no claim is made that v3 or the proposed new commands exist today.

## Local verification of this review checkpoint

Documentation only. The unchanged default check first reported 901/902 passing with one 5-second timeout in `response-ledger-cli.test.ts`; the original failure is retained. That unchanged file then passed all 7 tests, and a full unchanged repeat passed 902 tests in 162 files plus all four TypeScript projects in 36.458 seconds. No worker, timeout, test or production code was changed. These checks preserve the existing implementation; they do not execute or approve the proposed geometry. Logs and source hashes are in `Design Sprints/MOT131-Owner-Decision-Review-2026-10-31/`. No board disposition was changed.
