# MOT-120 free-board coding reference

Approved geometry remains `MOT131-BOARD-GEOMETRY-PROPOSAL.md` sections 15–16.
This local interaction slice follows code `35f642fd2f43b907855a45366d88a488c475e177`,
with R21 corrections at `896b0c813eec720f53c3db139db0b9777e56efb8` and direct
catalog insertion at `b11909964b26e7ec02efdfe726af797349867339`.
It does not clear the broader task-definition, independent implementation,
privacy, physical-device, performance, production or PDF holds.

## Read before extending

- `FreeBoard.tsx` wraps the existing lane view on the main Board tab. Local
  zoom, selection, scroll and gesture preview never create another document.
  Cards retain x/y; board images use asset-only board presentations. The
  geometry helpers and G6 migration/recovery implementation are unchanged.
- Move/resize/layer actions use existing validated commands. A gesture keeps
  a live-source snapshot, previews locally, rejects an invalid final rectangle
  or concurrent source change, and commits once. Never commit the last valid
  preview after an invalid release. Escape, lost capture and cancellation do
  not write. Board background touch scrolling remains available.
- The item selector makes tiny, locked and overlapping images reachable.
  Arrange selected item exposes non-drag alternatives. Expanded cards reuse
  TripCardView, including source evidence, traveler notes, day/time and scope.
- `trip_board_duplicate` is intentionally human-only. It resolves the source
  and asset ancestry, rejects cycles/missing media/colliding IDs/bad bounds
  before writes, shares same-board asset IDs and preserves scope, crop and
  permitted content. Booking, booking attention and live lineage are omitted.
  Never depend on generic top-level session guards for nested/source IDs.
- Native same-board clipboard references require an in-memory reference plus
  the matching local nonce and exact live session. Serialized clipboard claims
  cannot authorize access. Plain text and URLs are inert note content with an
  explicit Add text action. HTML is never executed; pasted URLs are never fetched.
  Input fields retain their native copy/paste/arrow behavior.
- `board-images.ts` checks bounded headers before decoding: at most 5 images,
  10 MiB each / 50 MiB per gesture, 8192 pixels per side, 16,777,216 pixels total.
  The shared decoder slot stays occupied until native decoding settles and its
  bitmap closes, including late cancellation. Retries queue with their own signal;
  cancelling a request never releases the slot before the underlying bitmap.
  JPEG EXIF orientation is parsed within the bounded header; oriented dimensions
  drive decoded-size validation and placement while raw budgets stay unchanged.
  Reject malformed/conflicting orientation data before decode; preserve originals.
  PNG, JPEG and simple static VP8/VP8L WebP are supported. GIF, VP8X WebP,
  AVIF/HEIF and unsupported headers fail before decode with a file/text fallback.
- Image ingestion stages originals, validates the complete document operation
  through executeAll, commits one Undo step, then persists bytes. Storage failure
  retains a recoverable tab-only copy. Do not claim atomicity across Yjs and blob
  storage, or call tab-only images durable. An aborted flight cannot consume a
  new retry or another actor's operation; duplicate callbacks cannot reapply.
  Cancel images is available only before document commit. The post-commit observer
  exposes saving progress and the existing Undo; observer errors cannot reverse
  the committed document or trigger staged-byte rollback. Keep final durable or
  tab-only feedback; never use broad compensating Undo as cancellation.
- Use existing MoT color tokens. Keep the mechanical harness, dependency files,
  existing assertions, timeouts and test settings unchanged.
- **Add FCC art** on FreeBoard opens the existing picker with its destination
  registry. `board-artwork.ts` snapshots the selected identity, source and crop,
  actor and placement origin before asynchronous work. Fetch only the selected
  original with credentials omitted, no redirects and a bounded streamed body.
  Reuse `prepareBoardImages` for header/pixel/byte limits and shared decode slots.
  Validate original dimensions, MIME and supplied original digest before writes.
- Keep the source sheet intact; crop is presentation data. Use cropped pixel
  aspect in square board units, never magazine page proportions. Commit one
  private `surface: board` presentation through executeAll and staged blob storage.
  Preserve credit, rights, original source date/version and origin city. Unknown
  or restricted rights retain the existing product policy; this grants no license.
- Each deliberate Add is distinct; concurrent flights cannot overwrite each
  other's identity or cleanup. A precommit close aborts. After commit, show saving
  progress and honest durable/tab-only completion. Closing then reopening must
  not let the old picker dismiss the new one. Leaving the initiating context
  suppresses stale UI feedback and aborts precommit work. Existing Composition
  insertion stays separate; no new agent authority, places or bookings are created.

## Local R23 correction — 1 November 2026

Code `a30ab8da84c21bbab94a3e2ab42353331a36f564` corrects R23-1/C1 by sharing
the native bitmap lifetime slot between artwork preview and board insertion.
Actual native-delivery probes reduce the outstanding peak from two to one,
including close/cancel and retry; Add after preview failure remains available.
All 1,200 tests /182 files, four types and build pass with the existing harness
unchanged. [Correction evidence](MOT120-R23-CATALOG-CORRECTION.md) records the
failing/green regressions, compiled desktop/touch screenshots and retained
initial check/probe failures. Actual independent Muse Wonder re-review R24 approves
the R23-1/C1 correction, with no new actionable finding; its fresh 1,200-test,
type/build and additional native queue checks pass. See the [independent report](MOT120-R23-WONDER-REREVIEW.md).
This does not establish physical Safari or full MOT-120 acceptance.

## Remaining work and acceptance

Cross-board clipboard graphs remain unimplemented. Use native package exchange
for cross-board data. Direct catalog insertion, local image upload/drop/paste
support board photos and transparent PNG stickers. The existing catalog/Composition
flow remains intact. R23 requested changes to direct catalog insertion; actual
Muse Wonder re-review R24 approves the R23-1/C1 correction only. R22 approved the earlier
R21 corrections. Broader independent/human acceptance remains. This is not full MOT-120
completion. Muse Wonder requested changes in R21 and approved the three corrections
at `896b0c8` on 1 November 2026; broader acceptance remains open. Emulated Chromium touch is not
physical iPhone/iPad or Safari acceptance. The 50-object exercise is functional
evidence, not a peak-memory or real-device performance claim.

The original slice's full check passed 1,142 tests in 172 files (33 additive tests),
four TypeScript projects, and the web build. Source was the canonical local
release base `7dddce9`; no existing test or configuration file changed in this
slice. Targeted red/green, native package roundtrip, browser pointer/keyboard/
emulated-touch/reload, cancellation, stale editing, image failure and quota
recovery checks are retained outside the repository in the planning folder:
`Design Sprints/MOT120-Wonder-Interactions-2026-10-31/`.

R21 corrections add 24 regression tests: 1,166 tests in 174 files, four TypeScript
projects and build pass. All 191 pre-existing harness blobs are unchanged. The
original browser scripts and new native EXIF/commit-phase/decoder-lifetime probes
pass. Actual Muse Wonder independently checked all eight orientations in both TIFF
byte orders, queue failure recovery and saving-phase Undo/Redo, approving only
these fixes. Evidence: `Design Sprints/MOT120-R21-Wonder-Fixes-2026-11-01/`.

Direct catalog insertion adds 15 tests: 1,181 tests in 175 files, four TypeScript
projects and build pass. Existing harness blobs remain unchanged. Deterministic
local catalog fixtures prove selected bytes/crop/credit, unchanged destination,
private geometry, Undo/Redo, native ZIP, reload, cancellation, keyboard/touch,
committed saving and quota recovery. Supplier availability, comprehensive catalog
coverage, physical-device performance and independent review remain held.
Evidence: `Design Sprints/MOT120-Wonder-Catalog-2026-11-01/`.

## Empirical agent failures to retain

Actual Muse Wonder authored the implementation in ten recorded calls. Rejected
drafts tried replacing the existing geometry helper and media parser, introduced
imagined helper APIs, reused a cancelled ingestion flight, built fresh clipboard
wrapper identities, and added off-palette colors. Exact preflight, new regression
tests, browser checks and the unchanged brand gate caught these. Two deliberate
mutations (copying booking authority and relaxing the image side cap) were caught;
original bytes were restored. Re-test these model failure patterns by 2027-04-30.
Use narrow prompts with exact existing APIs and validated references; never relax
the harness to make an agent draft pass.

The R21 correction draft had a new-test variable typo and missed conflicting
same-IFD orientation tags and truncated/exact-bound JPEG segments. New failing
regressions preceded Wonder's corrections. Re-test these patterns by 2027-05-01.

The catalog slice initially used unsupported caller-supplied presentation IDs
(an erroneous orchestration brief), non-FCC test URLs, and an incompatible
optional callback type. The real command/schema/tests/typecheck rejected them;
Wonder corrected the drafts without changing existing contracts. Re-test by
2027-05-01. Use exact command schemas and valid fixture provenance in future briefs.
