# MOT-123 local voting integration

1 November 2026. Tested product revision: `f78617106ef084813d6cca1df94ac400bedd9947`. Local integration includes the other worker's MOT-120 clipboard commit `ebc5673ef6ef9d584d4ef26d2459d2250348e69e`; no MOT-120 acceptance is claimed here. Implementation: Muse Wonder parent and core subagent. Independent review: actual `muse-wonder-1.0`, not Muse Wonder.

## Approved behavior

Alan approved the positional method and lifecycle, then explicitly selected **sealed closure and explicit new round**. `MOT123-CONTRACT-DISPOSITION.md` records the choices and supersedes the earlier proposal's pending Close/Undo wording. New rounds declare `mot-household-sticker-points@1`, advisory purpose and eligible roster before voting. Draft, open/provisional and closed/sealed states are explicit. Stamps remain independent; ties remain unresolved; no automatic winner, booking or new household authority is introduced.

Close freezes a verified canonical response/tally snapshot outside ordinary Undo. Late replies stay uncounted, with explicit late-Denied warnings. Revisions create a fresh proposal and responses; the confirmation discloses the effect on all older proposal versions. Closed history remains readable and can start a fresh draft even after Undo removes its live configuration. Private native backups preserve seals; public/agent/HTML projections exclude the private lifecycle data.

Legacy pure tally/ledger behavior remains unchanged. Document-bound automatic planning/routing/adaptation for managed rounds explicitly reports unavailable; it must not consume mutable late replies as sealed consent. This is a deliberate approved boundary, not a completed managed planning integration.

## Verification

All evidence is local under `C:/Users/alani/OneDrive/Documents/Vibe Code/Ministry of Tourism/Design Sprints/Route-To-80-2026-11-01/`.

| Check | Result |
|---|---|
| `npm run check` at tested revision | PASS: 1,246 tests / 188 files; four TypeScript projects. Vitest 53.98 s. `MOT123-check-final.log`. |
| Production build | PASS: `npm --prefix apps/web run build -- --outDir D:/WonderRoute80-20261101/build`; Vite 53.52 s. `MOT123-build-final.log`. Existing chunk warning retained. |
| Existing harness | 200 baseline file byte hashes unchanged; 270 tracked test/script/config paths compared against clipboard baseline without modification. 30 new voting tests added. |
| Independent arithmetic | Positional/IRV divergence A29/B29/C32, K5 partial A9/B5, ties, empty versus pending, independent Denied fixture A6/B5/C7. No IRV engine. |
| Recovery and privacy | RED/GREEN regressions cover stale/cancelled receipts, late/resolved/conflicting responses, Undo/Redo, two orphan seals, native backup import, forged totals, public byte/HTML/agent canaries. |
| Managed browser flow | PASS: Chromium at 1440x1000 and 390x1000 touch-emulated, localhost only, no console/page errors or provider attempts. `MOT123-browser-results.json`. |
| Muse Wonder review | Original c87cb6e review found two recovery defects; both reproduced, corrected, and independently re-reviewed at f786171. Integrated recommended; no own-work Verified claim. |
| Unchanged full legacy browser script | **NOT PASS.** Both c87cb6e and unchanged ebc5673 baseline stop at line 67: hardcoded October 31 booking deadline now renders passed, while assertion expects urgent. Script/assertion/clock unchanged. `MOT123-legacy-calendar-hold.json`. |

The legacy script completed five scenario groups before its expired-date assertion: exact 60-point tally/import/resolution, fairness versus points policy, selective Apply/Undo/stale Apply, response revision/conflict/partial tally, and confirmed access exclusions. Later script steps are not claimed covered by that run. The separate new managed flow covers its own reload/private import checks.

## Browser QA

Browser plugin not available; the existing installed Playwright runtime was used. Origin `http://127.0.0.1:5202/`, synthetic local data. Flow: declare draft -> open -> rank/export/import/resolve -> review/cancel -> keyboard-confirm close -> retain late Denied -> Undo -> reload -> new empty round -> private backup import -> orphan-history recovery. No physical-device or cold-offline claim.

| Rendered check | Result |
|---|---|
| Page identity / meaningful UI | PASS: real trip app and Group preferences dialog. |
| Framework overlay / console health | PASS: no overlay, page errors or console errors. |
| Interaction / persistence | PASS: exact frozen result, fresh responses, seal-preserving reload/private native import, orphan recovery. |
| Responsive screenshots | PASS: 1440 and 390; no document overflow. Wide tables retain horizontal scroll. |

Screenshots: `voting-close-preview-1440.png`, `voting-sealed-late-390.png`, `voting-new-round-390.png`, `voting-orphan-recovered-390.png`. The close preview uses option labels; late information is explicitly uncounted. Touch emulation is not Safari hardware evidence.

## Review corrections and holds

- AS123-I01 (P1): partial Undo left a valid later-round outbound response cache that was incorrectly validated against an older live group. Validation now selects a matching live definition or matching verified seal; no history is deleted.
- AS123-I02 (P2): a selected orphan seal could not reliably seed a fresh round and lacked a UI action. Recovery now preserves live definitions, allocates above all seals and uses the existing explicit confirmation in closed history.

Original and follow-up reports are saved alongside this document. Only MOT-123's contribution to R20-11 is satisfied; that finding remains OPEN for MOT-124. Physical device, shared-room, privacy acceptance and production setup holds remain. MOT-101 remains the sole release gate, and historical PDF closure is unchanged. No push, deployment, provider call, room backend or release acceptance occurred.

The board's unchanged equal-card weighting advances MOT-123 from Doing (25) to Integrated (75): 5,450 weighted points across 68 required cards = **80.1470588%**. This is implementation progress, not production readiness. The final compare-and-swap board receipt is `mot123-board-update.json` in the evidence folder; concurrent MOT-120 records are preserved.
