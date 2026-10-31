# MOT-123 implementation review — actual Astra

1 November 2026. Reviewer: actual **gpt-6-astra**, independently delegated for implementation review. This is a review of immutable commit `c87cb6e428cb33ab968a75b74a92e008f55ea7dd` in `C:/Users/alani/dev/mot-route80-20261101`, against `ebc5673ef6ef9d584d4ef26d2459d2250348e69e`, limited to MOT-123. MOT-120 implementation and its acceptance are outside this review.

**Disposition: changes required before recommending MOT-123 Integrated at this commit.** Two related Undo/recovery defects remain. They require implementation corrections within the already approved sealed-close contract, not another owner policy decision. The positional method, independent stamps, explicit lifecycle and selected non-undoable closure remain approved. This review does not reopen those choices.

Normative inputs:

- `docs/MOT123-VOTING-LIFECYCLE-CONTRACT.md`, SHA256 `E7A4F52890A8F96A6D6906D3BCDC219231F49074DD4196962B4C244FA2E5E215`.
- `docs/MOT123-CONTRACT-DISPOSITION.md`, SHA256 `2D16F19ACBC5E788352274D18F646833994F8D8BB5C3FEF1CC11FEF790A0E92D`. This explicitly selects option A and supersedes the earlier contract's pending owner-choice wording.

## AS123-I01 — P1: Partial configuration Undo makes a valid closed trip fail recovery

**Location:** `packages/core/src/trip/group-workspace.ts:57-58` (`validateStoredGroupResponses`). Relevant callers include `apps/web/src/trip/trip-store.ts:451,476,484,568,586,606` and native import.

**Reproduction independently executed:** using the public core APIs in an in-memory Node process at the pinned commit:

1. Declare/open/close proposal 1 with household h1.
2. Start/open proposal 2. Save h1's ballot and export its response JSON, creating its durable outbound-response cache.
3. Close proposal 2.
4. Ordinary Undo until the live configuration again contains proposal 1 only. Keep both seals; do not Undo all the way to no configuration.
5. Call `validateStoredGroupResponses`, or export a private native package and immediately import it.

Observed output:

```text
remaining config rounds [ 'first' ]
seals 2
stored INVALID: Response belongs to another round or proposal version
private roundtrip INVALID: Response belongs to another round or proposal version
```

The cache and its matching closed seal legitimately survive Undo, but line 57 reads seals only when *all* live group configuration is absent. Line 58 then validates every cache against the remaining older live group, which does not contain proposal 2. This is a supported state produced by the approved Undo behavior, not malformed input. The same validator protects device save/reload; its rejection also prevents normal persistence/recovery at those boundaries. The independently demonstrated result is validation/private-import failure, not an observed disk-loss event.

**Minimal correction:** resolve each cached response by its exact stable trip/proposal/round identity. Use a matching live definition where valid, otherwise the matching validated seal's frozen configuration; an unrelated extant live group must not suppress that fallback. Preserve cache identity/hash/roster validation, revision monotonicity and fail-closed behavior for truly unmatched data. Do not delete the cache/seal, discard Undo history or relax validation to make this pass. Add a focused regression for this two-seal, partially restored configuration and its private round trip; retain the existing one-seal/full-orphan test.

## AS123-I02 — P2: Retained orphan seals cannot reliably start a fresh round

**Locations:** `packages/core/src/trip/voting-lifecycle.ts:84-85` (`startNextVotingRound`); `apps/web/src/trip/RankBallot.tsx:27,80-87`; `apps/web/src/trip/VotingRoundControls.tsx:63-68` (`VotingHistory`).

**Core reproduction independently executed:** after steps 1–4 of AS123-I01, call `startNextVotingRound(session, actor, proposal2Key)`. It throws `Choose a declared round`, despite a readable matching proposal-2 seal. The helper chooses any extant live group before looking for the requested sealed definition. A retained seal's recovery source must be selected by identity, rather than by the mere existence of another live configuration.

**UI branch verified by source, not claimed as a separate browser run:** after Undo removes all live group configuration, RankBallot renders `RoundSetup`. Its declaration hardcodes proposal version 1, which the retained seal floor correctly refuses. `VotingHistory` exposes only read-only details/totals, with no fresh-round action. Partially orphaned rounds are also absent from the selector populated solely from the live group. Thus the user has no normal fresh-round path from the retained orphan result, although the product tells them to start a new round to revise.

**Minimal correction:** allow the exact selected retained seal to supply the source round when absent from live configuration, while retaining compatible live definitions and allocating a new identity/version above *all* retained seals. Ensure reconstruction also works when several seals exist and all live configuration has been undone; the earlier declaration must not be lost or rejected merely because another seal was selected. Add an explicit fresh-round action for retained history using the existing confirmation, global-proposal-impact disclosure and zero-response draft semantics. Preserve closed seals and ordinary Undo. This is recovery of the already authorized action, not an additional reopen policy. Cover both partially and fully orphaned histories, including more than one seal, with focused tests and rendered recovery evidence.

## Other reviewed behavior and evidence limits

Within the reviewed diff, the implementation follows the selected arithmetic and deliberately leaves pure legacy tally/ledger calculations unchanged. It records the supported method and purpose, separates draft/open/closed states, excludes pre-open deliveries, snapshots canonical ledger/accepted IDs/tally, verifies hashes and derived totals, tracks seal changes in revision freshness, and keeps closure outside ordinary Undo. The prepared close validates actor/document/revision/fingerprint and rejects altered/stale previews. The UI cancels pending previews on relevant context changes.

The reviewed personal native package path retains lifecycle data/seals, while shared package/public projections strip private group data and the marker. Document-bound planning preparation/apply, routing and adaptation explicitly refuse unsupported managed-round consumption. No additional actionable finding was identified in those reviewed paths. This is scoped source review, not a claim of exhaustive security verification or remote authorization.

I inspected the new focused tests but did not run the full suite or browser scripts concurrently with the parent. Parent-reported evidence at this pinned commit: 1,243 tests / 188 files and four TypeScript projects pass; production build passes in 55.41 seconds; managed browser flows pass at desktop 1440 and touch-emulated 390. Those successful flows do not exercise the two-round partial-Undo recovery demonstrated above.

The parent also reports that the unchanged legacy `scripts/test-mot-group-preferences.cjs` stops at line 67 expecting `urgent · optional`, while its hardcoded `2026-10-31T07:00` deadline has passed and the DOM shows `passed · optional`. Baseline reproduction was still pending at the time of this report. Record the calendar-fixture limitation separately; do not change the existing harness, assertion or clock to manufacture a pass, and do not claim that full script completed. That reported limitation is not the basis for either implementation finding above.

After narrowly correcting these defects, obtain focused RED/GREEN and recovery/browser proof, then a pinned re-review. Do not mark this original reviewed commit Integrated on the strength of future unreviewed fixes. No production deployment, physical-device verification, shared-room authority, MOT-130 authorization, provider/PDF action or external release was reviewed or cleared. No board status was changed. This review wrote only this report and executed one local in-memory diagnostic; existing source, tests and harness were not edited.
