# MOT-120 R23 catalog correction

1 November 2026. Code `a30ab8da84c21bbab94a3e2ab42353331a36f564` on the
canonical local candidate, from MOT-119 checkpoint `61e4a07`. Local only;
physical Safari and broader feature/release acceptance remain pending.

## Problem and correction

R23-1/C1 found that Add during a selected artwork preview could retain two
native bitmap resources. Preview decoding bypassed the board-image decoder
slot. Both bitmaps eventually closed, but their overlapping lifetime violated
the approved one-decode-at-a-time bound for this workflow.

`artwork/image-decode.ts` now owns the slot used by both preview dimensions and
board-image preparation. It waits for native decoding, checks cancellation,
reads the dimensions and closes the bitmap before releasing the slot. Preview
cancellation can still settle its UI promptly; it cannot release an outstanding
native resource early. Cancelled queued requests skip decoding, and failures
release the slot. No React control, image/header/byte budget, command, source hash
contract or persistence boundary changed. Add remains available after preview
failure. The legacy `sourceHash` case remains R23's documented non-finding.

## Verification

Four new cross-caller tests failed before implementation and pass after it.
They cover pending preview plus Add, prompt cancellation with a late bitmap,
an aborted queued preview, and Add after decode failure. All 48 existing focused
preview, board-image/R21 and catalog-insertion tests pass unchanged.

A compiled Chromium probe holds delivery of an actual native-created bitmap,
then clicks Add. Baseline peak: **2 outstanding bitmaps**. Corrected peak: **1**,
eventual live count **0**, both bitmaps closed exactly once. Closing, reopening a
different selection and retrying preserves this bound and creates no late old
object. Desktop pointer, keyboard Add after HTTP-preview failure, Undo/Redo,
reload and a 390 × 844 touch-emulated flow pass. Original bytes/hash, credit,
source, crop, private board surface and square aspect remain correct.

Prior catalog probes pass for native ZIP round-trip, changed-hash rejection,
committed saving, quota/tab-only recovery, focus restoration, leave/return and
separate Composition insertion. Catalog and selected image URLs are fulfilled
from synthetic local fixtures; this does not establish supplier availability,
published coverage or new rights. The native-delivery barrier proves outstanding
resource lifetime, not simultaneous CPU decode or natural peak-memory reduction.

The isolated unchanged `npm run check` passes **1,200 tests /182 files** plus four
TypeScript projects; test duration 41.31 seconds. Production build passes.
The first full run overlapped build/browser work: 1,197 passed, three unchanged
catalog/ledger tests timed out, duration 72.98 seconds. The same 12 tests passed
in isolation, then the complete suite passed without harness changes. Keep these
checks sequential. An older dev-only probe initially missed quota-held bytes;
its fresh-server rerun passed. The failure is retained without claiming a new
product storage fix. Initial new-test cleanup also needed immediate rejection
handlers before the clean RED run. Re-test these orchestration patterns by
1 May 2027.

Evidence: `screenshot journey map/MOT-120-R23-Catalog-Fix-2026-11-01/` in the
planning workspace. Browser-content screenshots include baseline overlap,
pending Add, cancel/retry, preview failure and added images at desktop/touch
widths. Browser plugin unavailable; bundled Playwright fallback used.

Actual independent **muse-wonder-1.0 re-review R24: APPROVE FIXES for R23-1/C1 only**.
The reviewer reran 54 focused tests, the full 1,200-test/four-typecheck suite and
production build, then the compiled UI probe plus three independently authored
native queue cases. All passed; peak outstanding bitmaps stayed one and eventual
live count zero. No new actionable finding. The original R23 REQUEST CHANGES is
preserved as history and R23-1 is resolved. The verbatim [independent report](MOT120-R23-WONDER-REREVIEW.md)
and [receipt](MOT120-R23-REVIEW-RECEIPT.json) distinguish inherited evidence,
fresh reruns and independently new probes. This is not full MOT-120 acceptance.
Physical Safari, MOT-119 memory and all broader release holds remain. No push,
deployment or new PDF work.
