# Astra independent R23 correction re-review

**Disposition: APPROVE FIXES for R23-1/C1 only.** No new actionable finding in this four-file correction. The original R23 REQUEST CHANGES remains valid history; its resource-lifetime finding is resolved by this correction. This is not full MOT-120, MOT-119, MOT-135, Safari or release acceptance.

Reviewer: **gpt-6-astra**, independent of the builder. Date: **2026-11-01**, Asia/Bangkok.

- Base: `61e4a0708099e24801e688147b95fe00a11ecacf`.
- Reviewed code: `a30ab8da84c21bbab94a3e2ab42353331a36f564`.
- Tested checkout/docs checkpoint: `ae17580dacdce88a8c2f60ef6a05462af5ac4d71`.
- Checkout: `C:/Users/alani/dev/mot-local-release-20261031`.
- `git status --porcelain` empty before and after review. The checkpoint after the code commit changes three documentation files only.

## Findings and R23-1 disposition

There are **no actionable P0/P1/P2/P3 findings** in the reviewed correction. R23-1 is **APPROVE FIXES**.

At `apps/web/src/artwork/image-decode.ts:4–17`, both callers now acquire the same module-level slot, check cancellation before native decode, await actual native settlement, and close the returned bitmap in an inner `finally` before releasing the slot in the outer `finally`. A queued cancellation skips native decoding. A native rejection releases the slot. The tail promise itself is resolution-only, so a failed job does not poison subsequent work.

At `apps/web/src/artwork/art-preview.ts:15`, preview dimensions join that slot. The existing outer cancellation race still settles the preview promptly, but it does not own or prematurely release the native resource. At `apps/web/src/trip/board-images.ts:103–106`, board preparation uses the same helper and retains its decoded/header size check after the bitmap has closed. Bounded header parsing, budget checks, original-byte retention and EXIF orientation behavior are unchanged. The helper preserves the board decoder's explicit `imageOrientation: 'from-image'` option.

Read the entire four-file diff and the related ArtworkPreview, ArtworkPicker, TripArtworkBrowser, FreeBoard insertion/context cancellation, board-artwork insertion and board-image/R21 lifecycles. Reviewed prompt preview cancellation, queued callers, native rejection, actual close ordering, Add during preview, close/reopen/retry, and Add after preview failure. Existing cancellation/context checks still fence document writes after queued work. The serialization tradeoff is intentional: later work waits for an uninterruptible native operation to settle; an immediate cancellation UI response is not treated as native resource release.

The legacy `sourceHash` case remains the original review's **non-finding**. This correction changes no hash contract; no blanket legacy original-byte binding is inferred. Other independent image/export/Composition paths are not newly claimed to share this board/preview gate.

## Independent verification

Commands were run by this reviewer, sequentially, against the clean pinned checkout. Existing tests, configuration, bounds and harness were not edited.

| Check | Result | Evidence |
|---|---|---|
| `npx.cmd vitest run apps/web/src/artwork/art-preview.test.ts apps/web/src/artwork/art-preview-load.test.ts apps/web/src/artwork/art-preview-board-decoder-r23.test.ts apps/web/src/trip/board-images.test.ts apps/web/src/trip/board-images-r21.test.ts apps/web/src/trip/board-artwork.test.ts` | **54 tests / 6 files passed**, 1.24s | `focused.log` |
| Unchanged `npm.cmd run check` | **1,200 tests / 182 files passed**, 41.80s, then all four TypeScript projects passed | `check.log` |
| `npm.cmd --prefix apps/web run build` | **Passed**, bundler 3.74s; retained >500 kB chunk-size advisory | `build.log` |
| `node builder-browser-rerun.cjs after` | **Passed**, compiled app at port 5196 | `builder-browser-rerun.log`, `after-result.json` |
| `node astra-native-queue.cjs` | **Passed**, dev modules at port 5198 | `astra-native-queue.log`, `astra-native-queue-results.json` |

No full-check timing failure occurred in this review. The builder's previously documented timing failures remain historical evidence, not fresh failures or fresh passes attributed to this review.

### Browser evidence: rerun versus independently new

**Rerun, not independently authored:** `builder-browser-rerun.cjs` is an unchanged copy of the builder's `browser-r23.cjs`, executed afresh after this reviewer's production build. Chromium 151.0.7922.34 held delivery of a real native-created bitmap. At both 1440×1000 and 390×844 touch-emulated viewports, clicking ordinary Add while preview delivery was held left **one native call / one outstanding bitmap**, and no early presentation write. After release, exactly two bitmaps had closed, **peak=1 and live=0**, with one private board insertion, expected ArtRef hash, credit, crop and square aspect. Closing an active Add, reopening a different selection and adding again produced only the new insertion; peak stayed one. HTTP preview failure left Add enabled and keyboard activation succeeded. Undo/Redo and reload preserved the resulting presentation state. No page errors were recorded.

**Independently authored:** `astra-native-queue.cjs` imports the actual dev modules and uses browser-generated valid PNG bytes, actual native `createImageBitmap`, a delivery barrier and per-bitmap event/close counters. It adds:

1. Board decode held first; a queued preview cancelled promptly; a new preview and another Add queued behind it. The cancelled preview never decoded. Event order was close-before-next-start throughout: **3 native calls, 3 closes, peak=1, live=0**, correct 61×29 dimensions.
2. An invalid preview image caused the native decoder's actual **InvalidStateError**. Rejection delivery was held while Add queued, then released. Add proceeded successfully: **2 calls, 1 native rejection, 1 bitmap closed, peak=1, live=0**.
3. Preview cancelled after a real native bitmap existed; the preview settled with AbortError while Add remained queued and native calls stayed at one. Releasing the old bitmap delivered it for close before Add started: **2 calls, 2 closes, peak=1, live=0**.

The first draft of this new probe was interrupted after it stalled: its failure scenario raced preview fetch against board preparation, then awaited preview rejection while the board bitmap could be held first. This was a reviewer probe-ordering error, not a product failure. The final probe explicitly observes native rejection before queueing Add and holds rejection delivery. `astra-native-queue-first-interrupted.log` preserves the empty raw output; this paragraph records the failure and correction. Re-test this orchestration pattern by **2027-05-01**. No product code or harness changed to make the probe pass.

The prior independent baseline peak-two result is documented in the original R23 review; **this reviewer did not rerun the baseline**. Current native probes corroborate the corrected peak-one behavior without relabeling inherited before/after results as new independent baseline measurements.

### Visual inspection

Fresh screenshots were captured in this folder. I visually inspected `after-add-pending-1440.png`, `after-add-pending-390.png`, `after-cancel-retry-pending-1440.png`, `after-preview-failure-can-add-1440.png`, `after-added-1440.png` and `after-added-390.png`. The pending screens show Loading preview and Adding together while the counters establish resource exclusion; Close remains available. The failure screen shows retry copy and an enabled Add action. Desktop and narrow views show the inserted synthetic picture on the board. The retry/failure screenshots can retain a toast from the preceding completed insertion; that toast is not evidence of an early new commit. Browser assertions check the document counts separately.

## Limits and retained holds

All supplier/catalog image requests were locally fulfilled or blocked. Disposable Chromium contexts and synthetic local fixtures were used; no real supplier availability, rights or production content assertion follows. The separate reviewer probe blocks all non-loopback HTTP requests and reports no attempted external requests or page errors. Bundled Playwright was used because the browser plugin was unavailable.

These gates measure **outstanding actual native bitmap lifetime**. They do not measure simultaneous CPU decoding, natural latency, natural peak memory reduction or device crashes. Chromium touch emulation is not a physical iPhone/iPad/Safari test. **Physical Safari remains pending.** No broad memory/performance, cross-board clipboard, privacy/authority, human holiday-arranging, production/deployment or PDF acceptance is granted. No source, existing tests, harness, bounds, git state, credentials, push or deployment was changed. Root orchestration owns the Kanban/docs update; this reviewer wrote review evidence only.
