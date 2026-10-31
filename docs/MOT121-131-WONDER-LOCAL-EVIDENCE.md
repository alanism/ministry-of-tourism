# MOT-121 / MOT-131 local continuation evidence

31 October 2026. Tested code `80ff1117a01044e4162f0baa7ff24c65c7ecb677` on `codex/local-release-consolidation-20261031`, from `e3b9d4015b76fafc7f0bd3966ed5307e9d837a96`. Actual Muse Wonder (`muse-wonder-1.0`) wrote the regression tests, one-line audit correction and geometry drafts; Codex orchestrated execution, diagnosed source gaps and reviewed/edited the proposal. Five model-call receipts, original responses, review corrections and failures are retained locally. No push or deployment.

## Delivered work

MOT-121: the magazine audit now prefers an existing explicit category, then recognizes only the explicit `hotel`/`restaurant` type, then retains the existing section fallback. Exactly two source rows (Osaka and Taipei restaurants) were misclassified as `food`; both now match existing catalog artwork. This is a metadata-audit correction. All 8,507 source identities, source URLs, frames, dimensions, credit/rights, registry uses and prior matches are preserved. The public catalog, images, generator and runtime UI did not change. Cross-city release aliases prove identical bytes, not independent venue, rights or live-availability evidence.

MOT-121 source handoff: a bounded diagnostic of nine local JSON files decoded only two already-embedded PNGs in memory. Their 16 valid frames have no matching full PNG digest in the supplied published registry/optimized release. The Manila brush master also lacks independent explicit city binding. `MOT121-SOURCE-GAPS.md/json` pins the hashes, frames and required authoritative dispositions. No FCC files or hosted data were changed, no image fetched/output, no rows removed and no inline-support or exclusion contract approved. These gaps remain visible for the source follow-up card.

MOT-131: `MOT131-BOARD-GEOMETRY-PROPOSAL.md` contains coordinate-ownership alternatives, saved/caller examples, migration refusal cases, reversible gestures, bounded clipboard/media handling and independently observable tests covering U1/U2/U3/U4/U6/U8. Twenty source/reference hashes bind the proposal to the current geometry implementation and Council lenses. Codex corrected the Wonder drafts, including invalid example provenance, asynchronous cancellation and migration semantics. G1–G6 remain pending owner/Astra decisions. No geometry runtime, schema, package format, permission or production gate was changed; this decision card is not complete.

## Verification

| Check | Actual result |
|---|---|
| New regressions before implementation | 9 tests: 5 passed, 4 expected classification failures |
| Focused tests after implementation | 53/53 pass, including all 44 existing focused tests unchanged |
| Unchanged `npm run check` | 902 tests in 162 files pass; four TypeScript projects pass; 37.613 seconds |
| Production build | Pass; 6.518 seconds; existing large-chunk warning retained |
| Existing artwork verifier | Pass; 5,203 entries across 200 cities; all four negative controls retained |
| Full metadata audit, repeated | Byte-identical reports; exit 2 retained; 5.835 / 5.454 seconds |
| Preservation reconciliation | 8,507 source rows unchanged, exactly two category/status corrections, no prior match regressed |
| Source snapshot | 611 frozen metadata/runtime file hashes unchanged; 20 geometry/reference inputs unchanged |
| Geometry document validation | JSON examples parse; G1–G6 pending; foundation IDs covered; final document hash pinned |

Full coverage remains open: **5,205 matched, 2,469 missing, 833 unresolved, one extra MoT entry, zero duplicate IDs**. Journal derivatives remain 3,416 matched / 16 unresolved. The two origin-role mismatches are eliminated; 814 unaccounted registry-use findings remain. These are source-row counts, not distinct MoT catalog counts. The immutable report denominator is 8,507, over 2,573 metadata inputs / 72,274,703 bytes. Metadata availability remains release-declared, not live-verified. Per-operation/product and licensing acceptance remain separate.

Artwork publication digest remains `3a14903b2643a0f5571fd46c0e1130117d86cd5ccefc8d2539c0e8598dc72740`. No current product UI changed, so the prior Austin/Manila real-byte browser evidence remains the applicable scoped observation; no new device, live-provider or broader picker acceptance is claimed. Planning-board draft/save/reopen browser checks are separate evidence in this directory.

## Failures and retained decisions

The first generated test draft had category-contract mistakes; Wonder repaired it before RED. The initial combined focused run failed because the isolated worktree lacked the existing `zod` dependency; linking the existing local installation allowed the unchanged suite to run. `missing-worktree-dependency.log` is retained. No test, type, lint, size limit or existing harness assertion was loosened. The default suite runs on the canonical candidate, avoiding duplicate package types across the isolated-worktree junction.

All required definition/Astra/R20, A22/A23, independent review, production setup, device/external evidence and PDF-closure constraints remain. No source-owner exclusion, license grant or G1–G6 acceptance is inferred from these documents. The existing WP6 URL-contract approval and prior evidence limitations remain in the previous checkpoint. MOT-121 and MOT-131 stay In progress.

## Reproduction

On the pinned candidate, run `node --test scripts/audit-mot-fcc-coverage.test.mjs scripts/mot121-sticker-coverage.regression.test.mjs scripts/mot121-magazine-type.regression.test.mjs`, `npm run check`, `npm --prefix apps/web run build`, then the existing `scripts/verify-mot-artrefs.mjs` with `apps/web/public` and an output receipt path. In the evidence directory, `run-audit.py` records the exact full/repeat audit inputs; `probe-source-gaps.py` reproduces the bounded source diagnosis. Both scripts pin local paths/snapshots; do not silently substitute newer inputs. The companion JSON binds logs, inputs, model receipts and reports by SHA-256.
