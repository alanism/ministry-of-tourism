# MOT-120 free-board coding reference

Approved geometry remains `MOT131-BOARD-GEOMETRY-PROPOSAL.md` sections 15–16.
This local interaction slice follows code `35f642fd2f43b907855a45366d88a488c475e177`.
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
  Decoding is sequential and every bitmap closes, including late cancellation.
  PNG, JPEG and simple static VP8/VP8L WebP are supported. GIF, VP8X WebP,
  AVIF/HEIF and unsupported headers fail before decode with a file/text fallback.
- Image ingestion stages originals, validates the complete document operation
  through executeAll, commits one Undo step, then persists bytes. Storage failure
  retains a recoverable tab-only copy. Do not claim atomicity across Yjs and blob
  storage, or call tab-only images durable. An aborted flight cannot consume a
  new retry or another actor's operation; duplicate callbacks cannot reapply.
- Use existing MoT color tokens. Keep the mechanical harness, dependency files,
  existing assertions, timeouts and test settings unchanged.

## Remaining work and acceptance

Cross-board clipboard graphs and a direct FCC-catalog-to-board insertion path
remain unimplemented. Use native package exchange for cross-board data, and
local image upload/drop/paste for new board photos or transparent PNG stickers.
The existing catalog/Composition flow remains intact. This is not full MOT-120
completion or an Astra implementation review. Emulated Chromium touch is not
physical iPhone/iPad or Safari acceptance. The 50-object exercise is functional
evidence, not a peak-memory or real-device performance claim.

The unchanged full check passes 1,142 tests in 172 files (33 additive tests),
four TypeScript projects, and the web build. Source is the canonical local
release base `7dddce9`; no existing test or configuration file changed in this
slice. Targeted red/green, native package roundtrip, browser pointer/keyboard/
emulated-touch/reload, cancellation, stale editing, image failure and quota
recovery checks are retained outside the repository in the planning folder:
`Design Sprints/MOT120-Wonder-Interactions-2026-10-31/`.

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
