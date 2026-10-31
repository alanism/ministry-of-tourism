# MOT-123 implementation re-review — actual Astra

1 November 2026. Reviewer: actual **gpt-6-astra**. Pinned candidate: `f78617106ef084813d6cca1df94ac400bedd9947`, repository `C:/Users/alani/dev/mot-route80-20261101`. Reviewed correction range: `c87cb6e428cb33ab968a75b74a92e008f55ea7dd..f78617106ef084813d6cca1df94ac400bedd9947` (six MOT-123 files; 35 additions, 10 deletions). Working tree was clean when inspected. This supplements, and does not overwrite, `ASTRA-MOT123-IMPLEMENTATION-REVIEW.md`.

**Disposition: AS123-I01 and AS123-I02 resolved at the reviewed candidate. No remaining blocking finding in this scoped fix review. MOT-123 is suitable for Integrated: the parent confirmed the final unchanged full check passed at this candidate.** The old calendar-fixture failure must remain explicitly recorded; this recommendation does not mean its full legacy browser script passed, nor confer Verified/Complete or production acceptance.

The approved positional/lifecycle contract and owner selection of sealed closure outside ordinary Undo are unchanged. Their SHA256 values remain those recorded in the original review: contract `E7A4F52890A8F96A6D6906D3BCDC219231F49074DD4196962B4C244FA2E5E215`; disposition `2D16F19ACBC5E788352274D18F646833994F8D8BB5C3FEF1CC11FEF790A0E92D`. No new owner decision is needed for these corrections.

## Finding resolutions

**AS123-I01, P1 — resolved.** `packages/core/src/trip/group-workspace.ts:57-58` now validates retained seals regardless of whether another live group exists. Each cached response uses a live definition only when its round identity is present; otherwise it uses the matching sealed configuration. Existing response/hash/cache-key validation still runs. The change does not delete valid caches, weaken unmatched-data refusal or clear Undo history.

**AS123-I02, P2 — resolved.** `packages/core/src/trip/voting-lifecycle.ts:42-51,85-86` selects the requested sealed definition if absent from the live group, preserves existing live definitions/household identities, permits reconstruction from a selected seal when all live configuration is absent, and allocates a fresh proposal above every retained seal. Reintroduced sealed definitions must match and cannot become a fresh managed identity. Multiple seals remain independent; an unrelated first seal no longer makes reconstruction from the selected later seal fail.

`apps/web/src/trip/VotingRoundControls.tsx:63-69` now gives orphaned closed-history entries the existing `VotingRoundControls`; both RankBallot and GroupOrganizer provide actor/refresh/notice/selection callbacks. This reuses the explicit new-proposal confirmation and global-history warning, then selects the fresh draft. It does not reopen a closed identity or copy prior counted responses.

## Independent checks and supplied evidence

I reran the original reproduction locally in an in-memory Node process, then extended it to full Undo and recovery through an imported private package. For each case: create/close round 1; create/open round 2, save/export a household ballot and close round 2; Undo either to round-1-only configuration or to no live configuration; validate stored responses; private export/import; compare both complete seals; start a fresh round from the selected round-2 seal; open it and check no responses count. Output:

```text
Partial Undo: validation, native roundtrip, fresh proposal3, empty counted responses, unchanged two seals PASS
Full Undo: validation, native roundtrip, fresh proposal3, empty counted responses, unchanged two seals PASS
```

This independently confirms the original failures no longer reproduce and the closed snapshots remain unchanged across private import and subsequent recovery. No source/test/harness edits were made for this diagnostic.

I reviewed the three added regression tests and evidence files beside this report. `MOT123-core-astra-recovery-expanded-red.log` records all three regressions failing before the correction; `MOT123-core-astra-recovery-green.log` records 44 tests across four focused files passing afterward, including the expanded lifecycle suite. `MOT123-ui-recovery-green.log` records four web tests passing. Existing test assertions and the immutable legacy harness were not changed in this correction diff.

The supplied browser RED log records the missing history “Start a new round” action. The GREEN log and `MOT123-browser-results.json` record passing complete managed flows at widths 1440 and 390, including orphan recovery, reload, late responses remaining uncounted, preserved seals, fresh new responses and private native seals, with no reported console errors. I inspected the 390px recovery screenshot. Browser execution is the parent's evidence, not an independently rerun browser session; the 390px run is touch emulation, not physical-device proof.

`MOT123-check-final.log` showed **1,246 tests in 188 files passing in 53.98 seconds**, followed by invocation of all four TypeScript checks. Before this report was finalized, the parent confirmed the full command completed with exit 0 and all four TypeScript projects passed at `f786171`. I did not run a competing full suite. A fresh build was still running; the previous pinned implementation's production build pass is retained as prior evidence, not mislabelled a fresh build of this correction. The parent should record the final candidate build result separately before integration.

`MOT123-legacy-calendar-hold.json` records an independent comparison of `c87cb6e` and baseline `ebc5673ef6ef9d584d4ef26d2459d2250348e69e`: the same unchanged script (SHA256 `221831885338c247fb0f5b9837f47570ad48e9f79f4105f147697083c6e1181d`) stops at line 67 expecting `urgent / optional` for deadline `2026-10-31T07:00`; both actual DOMs show `passed / optional`. The script, assertion and clock were not changed. The correction range does not modify this script. This supports treating it as an existing calendar-fixture limitation rather than a MOT-123 regression. Preserve `fullLegacyBrowserPass: false`; do not fabricate a full pass or infer coverage of steps after that assertion.

## R20-11 and retained limits

The original `Design Sprints/WP10-Definition-Review-2026-10-31/review.json` assigns R20-11 jointly to MOT-123 and MOT-124: owner-reviewed voting method/lifecycle, preserved historical scoring and independent expected fixtures. The approved decisions, implementation evidence and this correction review justify resolving **only MOT-123's contribution**. Preserve the original joint finding/task list in decision history and record the precise MOT-123 resolution/evidence. **R20-11 remains OPEN for MOT-124**; this review does not resolve its separate semantics, authority or acceptance requirements. I did not edit the board or review records.

Integrated is the supported local implementation recommendation, not permission to clear physical-device, production/deployment, shared-room, privacy acceptance or MOT-130 remote-authorization holds. No provider, PDF, network, push or deployment action was performed. MOT-120 remains outside scope. Only this re-review report was written.
