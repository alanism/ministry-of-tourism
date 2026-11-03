# Board, FCC discovery and HTML export — MOT-119–122/127/131

Planning reference; read [scope and council lenses](README.md). R20-5–10 and R20-13 apply. Use the existing product primitives. No new renderer, catalog service or separate canvas document is presumed necessary.

## MOT-131: settle geometry and interaction before MOT-120

At the inspected revision, `TripCardView` is exported from **`apps/web/src/trip/BoardView.tsx`**, not a separate `TripCardView.tsx`. Card x/y are finite fields in `packages/core/src/trip/schema.ts:100`; lane projection sorts by them in `projections.ts:14`. Presentations use normalized x/y/width/height with crop, rotation, zIndex, scope and a distinct magazineLayout (`schema.ts:128`). `packages/core/src/trip/presentation.ts` is a proposed path, not an existing authority. Do not create a similarly named file merely because a task guessed it.

Before implementation, write examples of callers and saved values for card move, image resize, duplicate and cross-board paste. Decide whether existing placements can express the main board or need a narrow versioned extension. Compare (a) extend existing presentation records with an explicit surface, (b) keep card board geometry authoritative and use presentations only where required, (c) separate canvas model. Prefer reuse; reject (c) unless a concrete invariant cannot be met otherwise. Do not store the same geometry in two authorities or repurpose magazineLayout without a migration contract.

Define:

- Coordinate space, origin, finite range, size/aspect bounds, stacking and transforms across scroll/zoom/viewport. Viewport resizing changes a view, not saved geometry. Determine lane ordering versus free placement and make switching views reversible.
- Card/content identity versus visual placement identity. Duplicating an object assigns new entity IDs, remaps references and preserves only permitted fields. Shared media can deduplicate by content, but ownership/scope still apply. Duplicate is not a new booking or vote.
- Existing v1/v2 trip/package round-trip and old-client behavior. Read actual current schema constants rather than relying on stale file comments. Preserve source evidence, notes, crop, media and scope. Do not widen a native package limit to make a new canvas fixture pass.
- One command/transaction per committed gesture or paste. Preflight the whole operation; failing later in a Yjs transaction does not provide automatic rollback. Media bytes and document references need a staged commit/recovery story.
- Pointer capture/release, Escape/cancel, scroll versus drag, resize handles, reduced motion, visible selection, focus return and keyboard/non-drag alternatives. Test typing in a text field: shortcuts must not move or delete the selected board card instead.
- Paste matrix: allowed MIME/type, plain text, selected image bytes, MoT object payload/version, unsupported HTML, URI list, multiple items, oversize and decode failure. Do not fetch arbitrary clipboard URLs or execute pasted HTML. Bind asynchronous completion to board, actor, scope and initiating action; switching boards or cancelling cannot land it elsewhere.

**Design pass:** A first-time traveler can arrange a trip with visible handles/menu alternatives and recover from a mistake. The free-flow view should feel like arranging holiday material, not editing coordinates. Ryo's shared primitives, Andy Allen's reversible play and Schaad's real interaction feedback guide this; none requires custom physics, mandatory sound or new onboarding. Every critical action works without hover. Preserve browser scrolling and readable focus at phone widths and increased text size.

**Negative controls:** release outside target, pointer cancellation, slow decode followed by board switch, quota failure, hostile HTML, two assets where the second fails, duplicate then Undo/Redo/reload, touch scroll through canvas, keyboard action inside an input. Snapshot both document and referenced bytes; no partial object or unrelated change.

## MOT-121/122: define the denominator before measuring coverage

The current app uses `apps/web/src/artwork/catalog.ts`, `ArtworkPicker.tsx` and the generated public index/shards. Start by locating the current builder and source contracts; do not rebuild FCC or silently add publication changes to MoT scope.

Inventory rows should identify source registry/version/digest, city/country ID, source asset ID, rendition role, canonical original or source-sheet/frame identity, dimensions/type/transparency, thumbnail/original locator, credit, declared rights and supported shop variant if any. Preserve original source IDs; URLs alone are not identity and two renditions are not two designs.

Classify eligibility **per operation**: discover, preview, insert locally, share, embed/export and shop handoff. Keep totals for discovered, included, excluded-with-reason, unresolved, duplicate and failed/unreachable. Unknown rights or a failed fetch is not “absent.” Record the original inventory denominator before filters and fail an incomplete scan as incomplete. A count of all rows proves neither all cities nor all usable paths.

MOT-92 records an owner decision permitting unknown/restricted artwork in shared copies with actual credit; `model.ts:179` implements it. Preserve this product policy. It does not constitute independent proof of an upstream license or a new grant for font embedding. Where a new distribution mode needs different treatment, document the asset and get the owner's disposition instead of silently excluding it or inventing permission.

Use a fixed local source snapshot for deterministic tests; record source timestamps and failed requests separately from successful coverage. Source refresh checks are a later, scoped online activity, not permission to contact providers during this local review. Exhaustively reconcile metadata without bulk-fetching originals. Declare bounded concurrency, time/byte limits and reproducible resume behavior.

**Search contract:** specify what is searchable (city/aliases/country/category/design labels), normalization, sort order, pagination and empty/loading/stale/error states. Search all eligible metadata, including unloaded shards, or clearly indicate that search is still incomplete. Exhaustive tests should enumerate every eligible ID through supported queries/filters/pages and compare sets, not screenshots or four sampled cities. Add adversarial duplicate aliases, accent/case variations, non-Latin labels, missing/empty shard and stale catalog fixtures.

**Insertion:** The selected stable asset/rendition identity, not current list index, controls Add/drag. Country/filter change, cancel, retry and cache refresh must not insert a late different item. Download originals only when needed; maintain transparency, aspect and source-sheet crop mapping. Metadata-only tests do not prove the selected bytes are the right image. Existing 4s/2s performance profiles remain unchanged; run genuine profiles when implementation is ready, never claim placeholder-image runs meet production budgets.

## MOT-127: apparel discovery and truthful handoff

Reuse the same audited inventory and existing `merch.ts`/Keepsakes paths. A mockup, a flat artwork and a product variant have separate roles. Show full supported collection without turning an unknown line/size/stock field into a product claim. Source version and variant identity travel together.

Enumerate every generated shop route/selection against the authoritative catalog contract. Validate protocol and origin; source-provided URLs are not unrestricted navigation authority. Public shop links contain no room token, household, title, dates or private query data; use the existing no-referrer/no-opener discipline. If a supported design deep link does not exist, name the documented general shop fallback before navigating. Only a deliberate user action opens commerce. Retain trip/filter position on return.

Browser proof must start from both the magazine ad and main board, find a different city's real line, preview, exercise missing/failed imagery, open the expected supported selection and return without losing trip state. Route enumeration is exhaustive; browser examples cover meaningful variants, not a claim of testing every remote checkout. No new checkout, billing or purchase.

## MOT-119: standalone magazine, not itinerary or memorabilia HTML

`render.ts` has itinerary and memorabilia HTML; they are not the magazine renderer. Start from `MagazineStudio.tsx`, `artifacts.ts` and the accepted magazine page pipeline. `createTripArtifact` at `artifacts.ts:129` already freezes a trip snapshot, tracks scope/revision, collects bytes and records delivery/keep failures. Extend the owning path narrowly rather than creating a second success/receipt lifecycle.

The export contract should state:

1. A real UTF-8 `.html`, correct MIME/filename, page count, scope, pinned revision and byte/hash receipt. Exported/ready means complete usable bytes; downloaded, kept locally and reopened are separate observations. A later trip edit marks the old artifact as an older revision rather than silently regenerating it.
2. A script-free static magazine if current pages permit it. Treat user/source text as escaped data. Audit every SVG href/xlink, image/srcset, style url/import, font, foreignObject, metadata, title, comment and embedded JSON; reject unsafe schemes, active content, unexpected network dependencies and private canaries. Do not rely solely on CSP or an iframe that is absent when the file opens independently.
3. Embed only selected permitted bytes. Reuse shared export metadata stripping and the declared rights policy; no raw full-document base64, token, private source string or unrelated asset inventory. Credits/licenses needed for distribution remain readable. A manifest/screenshot alone cannot prove hidden-data absence.
4. Start with one frozen selection. Parallel card edits, scope changes, deletion or board switching must not mix assets/revisions. Cancellation before/after collection, conversion, storage and download never advertises incomplete output. Keep failure with a successful download distinct from total export failure.
5. Name the actual accepted HTML/source dimensions and responsive behavior. Compare every output page's text/media/credits and layout against the accepted reader at desktop/narrow widths; do not rebuild PDF or rasterize pages to disguise missing text/fonts. Any chosen fallback must be explicit before completion.
6. Select measured input and output byte, image-pixel/decode and memory-work bounds before implementation acceptance. Base64 length is approximately `4 * ceil(bytes / 3)`; decoded raster memory and transient copies can dominate. A source-byte cap alone is insufficient. Preserve existing 10 MiB/file, 50 MiB native package limits; a new HTML contract is not permission to change them.

Open the delivered file after moving/renaming it, in a fresh context with network denied and no running app, browser storage, service worker or blob URLs. Inspect attempted requests as well as visible output. Keep deliberate source/shop navigation separate from resources needed to render. Test actual physical Safari file-open separately; desktop WebKit or mobile-sized Chromium is not that evidence.

Retire only the visible PDF action and its user-facing generation/progress entry points under the owner's closure. Do not reopen PDF generation, proofs, benchmarks or optimization. Preserve historical records and native JSON/ZIP behavior. Acceptance checks here are proposals for feature verification; do not modify existing tests to force a green result.
