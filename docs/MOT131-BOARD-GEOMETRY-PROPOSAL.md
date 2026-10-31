# MOT-131 — Main-board geometry and reversible interaction proposal

**Status: OWNER APPROVED WITH REVISIONS; ASTRA REVIEW PENDING.** Alan approved G1–G6 as recommended on 31 October 2026. The decision review in MOT131-G1-G6-OWNER-REVIEW.md is authoritative for the revisions incorporated here. This is not implementation, independent review, production acceptance, or proof of proposed behaviour. MOT-131 remains contract-only. Existing holds, harnesses and limits are unchanged. Material labelled **PROPOSED** is not valid current schema-v2 input and must be rejected by a current client unless a later approved implementation adopts it.

This proposal preserves MOT-123, MOT-130, MOT-132 and MOT-136. Membership, privacy authority and actor authority remain governed by MOT-130. The minimal downstream implementation, if later approved, belongs to MOT-120/MOT-122, with dependencies MOT-133/MOT-134; MOT-131 does not absorb that work.

Pinned source: `e3b9d4015b76fafc7f0bd3966ed5307e9d837a96`; board save 198. Muse Wonder drafted this proposal; Codex reviewed and corrected contract examples. Source hashes are retained in the local evidence packet. JSON snapshots below are abbreviated explanatory examples, not complete valid command inputs. New fields and commands remain proposed.

## 1. Inspected current facts

- Native trip persistence is schema **2**. Packages are version **2**, with frozen package caps of **10 MiB per file and 50 MiB total**. Those caps are existing facts, not proposals, and are not changed here.
- `TripCard.x` and `TripCard.y` already exist as required finite numbers in `packages/core/src/trip/schema.ts`. They currently have no bounded board extent, unit interpretation, size, rotation or global stacking semantics.
- Cards also have optional saved size only if this proposal later adds it; no such size field is claimed as current.
- `boardProjection` in `packages/core/src/trip/projections.ts` groups cards by `stage` and orders each group by `y`, then `x`, then `id`.
- The existing lane drop in `apps/web/src/trip/BoardView.tsx` is writable: it calls `trip_card_move` with an explicit `stage`. A lane projection is therefore derived presentation, while the lane-drop command remains an explicit stage-changing route.
- The existing BoardView editor contains day/time fields. It has **no manual coordinate or address field**. A location data model exists on cards, with latitude, longitude and a `catalog|traveler` source in the supplied command contract, but a manual location-entry UI is a proposal, not current behaviour.
- Presentations in `packages/core/src/trip/schema.ts` have normalized `x/y/width/height`, crop, rotation, integer `zIndex`, `locked`, optional card or asset references, and optional `magazineLayout`. `magazineLayout` belongs to the magazine surface and must not be borrowed for the main board.
- `trip_card_create` does not accept a caller-supplied card ID; the command generates the ID. `TripSession.executeAll` cannot use the result of one operation as input to the next operation inside that same call because all operation inputs are prepared before execution.
- `TripSession.executeAll` in `packages/core/src/trip/session.ts` preflights prepared operations against a throwaway Yjs document and then executes them in one transaction with one Undo step. That mechanism may be reused, but it does not supply cross-operation ID references.
- Source evidence is protected by existing session checks. Agents cannot replace source evidence or assert independently verified facts where the current checks forbid it, and agents cannot mutate private cards or specified private presentations. A client-supplied actor label is a local actor label, not remote authority.
- Media staging exists in `apps/web/src/trip/trip-assets.ts`. Asset bytes and the Yjs document are separate stores; there is no cross-store atomic transaction.

No claim is made that the current upload path already enforces decoded-pixel limits. It does not, on the facts supplied. Byte limits and decoded-pixel limits are different controls.

## 2. Corrected Foundation coverage

The U1–U4/U6/U8 observations must be addressed by this contract. The interaction choices and Foundation product prioritization remain proposals for disposition:

- **U1 — direct place capture:** propose an explicit place-entry route over the existing card/location model. An address without coordinates remains text; no guessed map pin or automatic URL fetch.
- **U3 — clipboard:** support the bounded MIME matrix below, with a visible file/text fallback for unsupported clipboard content. The reported silent paste was one observed browser/context, not proof of universal failure.
- **U6 — scheduling access:** expose the existing day/time editor through a visible keyboard-reachable action; retain its date engine and current canonical fields.
- **U2 — capture and add-versus-replace:** capture, paste and file entry should make clear whether content is added as a new object, attached to an existing card, or replaces an existing representation. Capture must not silently replace canonical content.
- **U4 — readable expansion:** a card must be expandable locally to a readable width for long text. Expansion is view state and need not alter saved card size or board geometry. Fixed-size board cards do **not** prevent readable expansion, because the expanded reader/editor can be a local overlay, panel or focused view.
- **U8 — text/image representation and workflow distinctions:** text, image, canonical card content and visual placement must remain distinguishable. An image placed on a board does not by itself prove a visit, booking, venue, route or completed workflow step. Board saving, media-byte persistence and export are also distinct workflow states.

These routes preserve the complete canonical trip. Readable expansion and board arrangement do not themselves select the Foundation top bet or change MOT-136.

## 3. Alternatives

### Alternative A — card coordinates plus board-surface asset placements

Cards retain `TripCard.x/y` as their sole saved board position. Asset-only board objects use a presentation record explicitly routed to the board surface. A fixed, versioned board extent maps normalized presentation geometry into the same board coordinate system used by cards. One global stacking rule orders cards and board images together, including interleaving.

This is the smallest option that reuses card movement, projections, sessions, Undo, media staging and package handling. Its cost is two record shapes, so surface routing and identity rules must be explicit in code rather than inferred.

### Alternative B — board presentations for every object

Every card and image would receive a board presentation, while card `x/y` became legacy ordering data. This gives one placement record shape and can support uniform stacking. Its costs are a placement migration for every card, transitional ambiguity about whether card `x/y` or the presentation is authoritative, and extra records for cards that may never be visually manipulated. It is cleaner conceptually for a new system, but larger for this existing one.

### Alternative C — separate canvas model

A separate canvas document would duplicate identity, privacy, media, Undo, export, synchronization and migration rules. It is rejected unless a later concrete invariant cannot be met by A or B.

**Owner decision G1: Alternative A.** It keeps card `x/y` as the single card-position authority, adds no card-linked board presentation competing with it, and confines the new placement concept to asset-only objects.

## 4. Recommended geometry contract under A

All values in this section are **PROPOSED** unless identified as existing.

### 4.1 One coordinate system

**PROPOSED `BOARD_EXTENT_V1`:** width `10000`, height `10000`, origin at the top-left, `x` increasing right and `y` increasing down. Board units are abstract units, not device pixels. Viewport size, zoom, scroll, device width and text scaling are local view state and are never saved.

For cards, saved authority remains:

```json
{ "x": 1240, "y": 860 }
```

For a **PROPOSED** asset-only board presentation, existing normalized fields remain its saved representation:

```json
{
  "surface": "board",
  "x": 0.08, "y": 0.08,
  "width": 0.45, "height": 0.315,
  "zIndex": 3
}
```

The mapping into the shared board system is deterministic and derived, never separately stored:

```text
boardX = x * 10000
boardY = y * 10000
boardWidth = width * 10000
boardHeight = height * 10000
```

Thus the example occupies board rectangle `(800, 800, 4500, 3150)`. Rendering, hit testing, overlap and stacking use that derived rectangle in the same space as card `x/y`.

Existing presentations without the proposed discriminator remain magazine presentations. A later implementation must explicitly filter or route by surface before rendering, exporting or transforming records. It must not assume the existing magazine pipeline automatically ignores a new board surface. Board placements must not leak into magazine output, and magazine placements must not be consumed as board placements.

### 4.2 Proposed card size and stacking fields

**PROPOSED optional fields on cards:**

```json
{
  "boardWidth": 1200,
  "boardHeight": 900,
  "boardStack": 0
}
```

- Absence of `boardWidth` means the pending default `1200` board units.
- Absence of `boardHeight` means the pending default `900` board units.
- **PROPOSED limits:** minimum card size `400 x 300`; maximum `5000 x 5000`.
- Absence of `boardStack` means `0`.
- `boardStack` is an integer in the proposed range `-1000000..1000000`.

For board-surface asset presentations, the existing integer `zIndex` is interpreted as the same global stacking domain. No new asset stack field is needed. For magazine presentations, `zIndex` retains its magazine-local meaning and is not mixed with board order.

**GLOBAL PROPOSED STACKING RULE:** collect cards and board-surface asset placements; derive each object's board rectangle; sort ascending by:

```text
(globalStack, stableObjectKey)
```

where `globalStack` is card `boardStack` or asset-presentation `zIndex`. Later objects paint above earlier objects. Because the stack values share one domain, a card can be below one image and above another. “Bring to front” sets the object's stack to the current maximum plus one; “Send to back” sets it to the current minimum minus one, subject to the proposed bounds. Ties use a stable key containing record kind and ID, compared deterministically without locale-dependent ordering. Position never breaks paint-order ties; dragging cannot change layering. Lane ordering remains unchanged.

G3 recommendation: board cards and board-only image placements start with rotation fixed at zero; existing magazine rotation is untouched. An owner may instead approve bounded board rotation with explicit corner/extent tests. No implementation may choose that fork silently or borrow `magazineLayout`. For every committed board rectangle require its right/bottom edges within the extent, not merely x/y within range. Board-image minimum width/height is proposed as 100 units (normalized 0.01); maximum is the 10000-unit extent. Reject rather than clamp an out-of-bounds new gesture. Stack overflow also fails with a visible explanation; no silent renumbering of unrelated objects.

### 4.3 Lane projection and stage

`boardProjection` remains derived: it groups saved cards by `stage` and sorts by `(y, x, id)`. A free-board move updates only card position and, if explicitly resized or restacked, its proposed size/stack fields. It does not silently change `stage`, `day`, `time`, scope or content.

The existing lane view is not declared read-only as a whole. Its projection is derived, but its existing lane drop remains a writable explicit stage route through `trip_card_move` with `stage`. Menu-based stage movement remains another explicit route. Dragging across a visual lane boundary on the free board does not itself assign a stage.

### 4.4 Expansion and location

Activating a card opens a readable local expansion using existing card content and the existing editor. Expansion may use an overlay or panel and returns focus to the originating card. It does not write `boardWidth`, `boardHeight`, `x` or `y` merely because the user read or edited the card.

A manual address or coordinate-entry UI is **PROPOSED**. It would write only through the existing location model and provenance rules. Entering an address must not invent coordinates, and entering coordinates must not pretend a catalog match exists. No geocoding service is proposed.

## 5. Duplicate and paste commands

The existing commands cannot implement graph-remapping duplication by chaining operations whose later inputs depend on newly generated IDs. The following are therefore **PROPOSED new narrow commands**, not sketches of existing APIs.

### 5.1 Proposed duplicate command

```json
{
  "command": "trip_card_duplicate_PROPOSED",
  "input": {
    "sourceCardId": "card-a",
    "offset": { "x": 120, "y": 120 }
  }
}
```

The command preflights the complete source graph, allocates the new card ID internally, validates every copied reference, and commits once. It does not require the caller to predict the generated ID.

Before, saved target-board state contains:

```json
{
  "id": "card-a",
  "title": "Gallery",
  "scope": "private",
  "body": "Meet at 10.",
  "stage": "plan",
  "x": 1000, "y": 800,
  "assetIds": ["asset-1"],
  "placeId": "place-9",
  "source": { "id": "external:gallery", "url": "https://example.test/gallery", "retrievedAt": "2026-01-01T00:00:00Z" },
  "sourceText": "Opening information",
  "travelerNote": "Allow an hour",
  "booking": { "status": "confirmed", "reference": "QA-BOOKING-REF" }
}
```

After one successful duplicate, `card-a` is unchanged and a new saved card exists. The generated ID is illustrated as `card-copy-1`:

```json
{
  "id": "card-copy-1",
  "title": "Gallery",
  "scope": "private",
  "body": "Meet at 10.",
  "stage": "plan",
  "x": 1120, "y": 920,
  "assetIds": ["asset-1"],
  "placeId": "place-9",
  "source": { "id": "external:gallery", "url": "https://example.test/gallery", "retrievedAt": "2026-01-01T00:00:00Z" },
  "sourceText": "Opening information",
  "travelerNote": "Allow an hour"
}
```

The same-board copy may reference the same asset ID because the asset remains in the same board. Booking status/reference, booking-attention authority, votes, ballots, group responses and live lineage authority are omitted. If placement at the offset would exceed the proposed extent, preflight fails visibly rather than silently clamping.

### 5.2 Proposed cross-board paste command

```json
{
  "command": "trip_board_paste_PROPOSED",
  "input": {
    "targetBoardId": "board-b",
    "sourceBoardId": "board-a",
    "cards": [{ "sourceId": "card-a" }],
    "assetPlacements": [{ "sourceId": "pres-a" }]
  }
}
```

The command runs in the target board session; TripCard has no proposed boardId field. A complete versioned source snapshot and referenced bytes must accompany the abbreviated request shown here. Same-app source references require an authorized read; external clipboard/native payloads are untrusted imported data, never proof of source ownership or room membership. Validate all content, scope and references before allocating the committed graph. There is no operation-result interpolation in the existing executeAll API. Before commit, the command builds a complete remap, for example:

```text
card-a  -> card-b1
asset-1 -> asset-b1
pres-a  -> pres-b1
```

Before, board B has no corresponding records. After, its saved records include:

```json
{
  "id": "card-b1",
  "title": "Gallery",
  "scope": "private",
  "assetIds": ["asset-b1"],
  "placeId": "place-9",
  "source": { "id": "external:gallery", "url": "https://example.test/gallery", "retrievedAt": "2026-01-01T00:00:00Z" },
  "sourceText": "Opening information",
  "travelerNote": "Allow an hour",
  "x": 400, "y": 400
}
```

```json
{
  "id": "pres-b1",
  "boardId": "board-b",
  "assetId": "asset-b1",
  "surface": "board",
  "x": 0.08, "y": 0.08,
  "width": 0.45, "height": 0.315,
  "crop": [0, 0, 1, 1],
  "zIndex": 3,
  "scope": "private"
}
```

Cross-board asset metadata is re-registered under a new asset ID; bytes may deduplicate by hash without copying identical bytes. Source, credit, rights and crop are preserved where present. Copied scope must not elevate source privacy: a private source cannot become shared through paste, and any target default may only narrow it. Whether the actor may read the source or write the target remains a MOT-130 membership/authority decision, not something this command grants.

Fully independent operations may still use existing `executeAll` when no generated ID or remapped reference is needed. Otherwise, the proposed narrow command above is the permitted pattern.

### 5.3 Move and resize callers (proposed surface routing)

A card at `{ "id":"card-a", "x":1000, "y":800, "stage":"plan" }` moves to `{ "id":"card-a", "x":1240, "y":860, "stage":"plan" }`. Use the existing `trip_card_move` once on commit: `{ "id":"card-a", "x":1240, "y":860 }`; preserve scope, day/time and source fields. No write occurs during pointer movement.

For a new board-only image presentation, before is `{ "id":"pres-a", "boardId":"board-a", "assetId":"asset-1", "surface":"board", "x":0.08, "y":0.08, "width":0.30, "height":0.21, "crop":[0,0,1,1], "rotation":0, "zIndex":3, "scope":"private" }`; after resize only width/height become `0.45/0.315`. Once the proposed schema/surface validation exists, the existing `trip_presentation_update` caller sends `{ "id":"pres-a", "width":0.45, "height":0.315 }` once. Pixel hash, dimensions, credit, rights, crop and every magazine placement remain unchanged. Resizing preserves aspect by default; any unlocked-aspect or crop action needs explicit owner disposition rather than changing pixels silently.

## 6. Interaction and idempotency

Pointer movement during a drag changes local preview only. Release commits once through the appropriate command; Escape, pointer cancellation or loss of capture commits nothing. Every move, resize and restack has keyboard and menu equivalents. Shortcuts are inert while focus is in an input, textarea, select or content-editable region. Touch dragging starts from an explicit handle or equivalent affordance so one-finger scrolling outside that affordance continues to scroll. Focus returns to the originating object after commit, cancellation or dialog closure.

A live paste or placement gesture receives a fresh token at initiation. The client keeps a bounded in-memory terminal record for that token — `committed` or `aborted` — until all promises owned by the gesture settle or the owning view unmounts. A late duplicate callback for the same token is therefore ignored. A deliberate retry creates a new token. This is not a durable exactly-once promise after reload; after reload, no such guarantee is claimed.

Leaving board A permanently invalidates a pending A gesture, even if the user later reselects A. The expected result is zero writes to board A and zero writes to board B. Stale revision, aborted signal, unmount or token mismatch produces the same no-commit result and a visible explanation where a user initiated the action.

## 7. Media bounds and failure behaviour

Existing package caps remain frozen at 10 MiB per file and 50 MiB total. The following additional controls are **PROPOSED under G5**, not current upload behaviour:

- At most **5 clipboard/drop items per gesture**.
- Decode sequentially, with concurrency **1**.
- Before full decode, parse the image header and reject any image over **8192 pixels in either dimension** or over **16,777,216 total pixels**.
- At that pixel maximum, one RGBA buffer is approximately `16,777,216 × 4 = 67,108,864 bytes`, about **64 MiB**, before temporary decoder overhead. Sequential decode bounds the design to one such principal decoded image at a time; the implementation must still measure actual peak memory.
- Encoded bytes remain within the existing frozen envelope: no file over 10 MiB and no gesture intended for package inclusion over 50 MiB total. This does not guarantee the entire accumulated trip will fit a package; existing export checks still apply to the complete selected output and must report an over-budget result honestly.
- Decoder cancellation is cooperative where the platform permits it. If cancellation is requested but decoding later completes, the completion handler must close or release the decoded bitmap/buffer and must not stage, register or present it.

**Proposed MIME matrix:** PNG/JPEG/WebP/GIF/AVIF image bytes go through type/header/size validation, then sequential decode; text/plain creates a note; a versioned internal MoT graph uses the validated paste path above. HTML is not executed or inserted as rich content; offer explicit plain-text paste instead. URI lists are not fetched; offer saving the URL as text or the explicit manual place route. Unknown binary types, missing clipboard permission, malformed internal payloads and unsupported header parsers produce a visible reason plus a file-picker/text fallback. A format without a safe bounded header parser is rejected before full decode, not optimistically decoded. Multi-item paste is all-or-nothing at the document boundary.

After validation, reuse the current staging lifecycle: hashed bytes are staged in this tab; one preflighted document command makes the graph visible; then blob persistence is attempted. A persistence failure leaves an explicit tab-only state and a recovery/export route. No all-or-nothing promise spans the blob store and Yjs. Commands do not free shared byte hashes on Undo. Transient decoded images must be closed between sequential items; cancelled late completions cannot commit. Empty and populated board tests must cover first paste, 50 existing objects, overlay focus return and touch scroll; these are proposed evidence scenarios, not new harness budgets.

All items are validated before any document commit. If item two of two fails, the gesture commits no card, presentation or asset registration. A user-visible error identifies the failed item and permits a fresh retry with a new token.

Asset bytes and Yjs state have no cross-store atomicity. The honest states remain separate: document saved, bytes persisted on this device, bytes available only in this tab, and exported. Quota failure must not be reported as device persistence.

## 8. Source text, provenance and actors

Read-only source wording must preserve the actual provenance and traveler-note contract rather than collapse them into one editable note. `source` identifies provenance, `sourceText` carries source evidence, and `travelerNote` carries the traveler's own note. Board gestures do not rewrite any of them.

Existing agent mutation checks remain enforced. In particular, agent restrictions concerning source evidence, independently verified facts, private cards, private presentations, media access, booking recording and scope changes are not weakened by a board gesture. A locally displayed actor name or client-supplied actor label does not create remote authority; authorization follows the established session and MOT-130 rules. Claims in the interface must remain bound to the current source and must not invent fields or verification states.

## 9. Migration and versioning

G6 proposes trip schema v3 and an explicit v2→v3 migration (`TRIP_MIGRATIONS[2]`); no schema or envelope change is implemented here. Package versioning must be explicitly reviewed, never inferred from trip version. A v2 client must reject a v3 document without persistent writes. v1/v2 fixtures must exercise the entire supported migration chain. Missing surface on legacy presentations means magazine; no old presentation is reinterpreted as a board image.

The recommended deterministic migration handling is **refusal without mutation** when legacy geometry cannot fit the proposed extent.

A later migration preflight would scan every existing card before making persistent writes. If any finite card position lies outside `0..10000`, or its explicit/default footprint extends beyond the proposed extent, migration stops, the original v2 data remains intact, no partially migrated v3 document is written, and the user is told that explicit layout recovery is required. This proposal does not silently clamp, round, reorder or erase the historical position/order of such cards. In-range legacy positions and their `(stage, y, x, id)` order are preserved exactly.

Unknown future schemas are rejected before persistent writes. A future-version package is rejected as a whole, not partially imported. A client that does not understand a later board schema must not silently interpret board presentations as magazine records.

Native private **content** preservation is scoped separately from Yjs/Undo history. Migration and native backup must preserve private cards, private media references, source evidence, rights information, notes, crop and scope markings according to the applicable existing contracts. Filtered packages are **not** promised to preserve full private history, Yjs history, Undo stacks or every private record excluded by their filters. No such history-preservation promise is added here.

Native JSON/ZIP snapshots retain both surfaces when permitted by the existing privacy/selection rules; a magazine-only output filters to its intended magazine placements. If board presentations are introduced, package export, package import, board rendering and magazine rendering must explicitly route by surface. The implementation must prove that board placements do not leak into magazine output and magazine placements do not appear as board objects. That routing cannot be assumed from the existing magazine pipeline.

## 10. Undo and observable acceptance tests

Undo restores semantic geometry and entity state, not byte-identical Yjs. Revisions, timestamps and history metadata may change and revision values may increase. A correct test asserts that cards, presentations, geometry, stacking, references, scope and content equal the pre-gesture semantic state after Undo, while allowing revision/history differences. A failed preflight may claim no mutation.

Externally observable tests should include:

1. Move a card and reload: saved position changes; stage, day, time and scope do not. One Undo restores the prior semantic geometry.
2. Use lane drop: stage changes through the explicit route, while board coordinates are not silently rewritten.
3. Interleave card, image, card through stacking operations; reload preserves that paint order.
4. Expand a long card: readable expansion opens without changing saved size or position.
5. Duplicate the example in §5.1: the copy has a new ID, preserved permitted references, and no booking or ballot authority. Undo removes only the copy semantically.
6. Paste the example in §5.2: target IDs and references match the stated remap; source-board saved data is unchanged; privacy is not elevated.
7. Start a paste on board A, leave A, then reselect A: zero writes occur to both A and B.
8. Deliver the same gesture completion twice: the terminal token record prevents a second object; a deliberate retry uses a new token.
9. Paste two images where the second exceeds the proposed pixel bound: neither item commits and decoded buffers are released.
10. Attempt migration with a legacy card at `x = -25` or `x = 25000`: migration refuses, original v2 data remains intact, and no partial v3 data appears.
11. Export and reimport a populated board; verify explicit surface routing, source evidence, crop, scope and media references, without promising filtered packages preserve full private Yjs history.
12. Type arrows and Delete inside a card title field: no board object moves or is deleted.

## 11. Risks carried

The principal risks are legacy coordinates outside the proposed extent, overlap on populated boards, stack ties being misunderstood, board records leaking into magazine rendering, oversized decoded images exhausting memory, late asynchronous completions landing after navigation, quota failures being misreported as durable saves, and cross-board paste widening privacy. Each remains a pending design risk until the decisions below are made by the actual owner/Astra and later implementation evidence exists.

## 12. Decisions required

Alan approved all G1–G6 recommendations, including the G3 stable-stacking revision, G4 graph authorization and G6 recovery/store/package compatibility requirements. Astra disposition remains pending. The owner decision memo below controls over historical proposal wording such as “proposed” or “pending”; those labels mean not yet implemented, not missing owner approval.

- **G1:** choose A, B or C. Recommendation: A.
- **G2:** approve or reject proposed optional card `boardWidth`, `boardHeight` and `boardStack`, including the stated pending defaults and limits. Readable expansion does not depend on approving saved card size.
- **G3:** approve or revise `BOARD_EXTENT_V1`, coordinate mapping, global stacking rule, minimum sizes and rejection of out-of-extent commits.
- **G4:** approve the proposed narrow duplicate/paste commands, field-copy exclusions, graph remapping and no-privacy-elevation rule.
- **G5:** approve or revise the proposed item count, sequential decode rule, header/pixel bounds and cancellation behaviour. Exact numbers above are proposed, measurable and not current enforcement.
- **G6:** approve refusal-based migration for out-of-extent legacy geometry, future-schema rejection before writes, explicit surface routing, and the separate treatment of private content versus Yjs/Undo history.

## 13. Downstream boundary

After the remaining Astra review is resolved, the minimal implementation belongs to MOT-120/MOT-122 and their MOT-133/MOT-134 dependencies, using the existing code paths in `packages/core/src/trip/schema.ts`, `packages/core/src/trip/persist.ts`, `packages/core/src/trip/commands.ts`, `packages/core/src/trip/session.ts`, `packages/core/src/trip/package.ts`, `apps/web/src/trip/BoardView.tsx` and `apps/web/src/trip/trip-assets.ts`. MOT-131 authorizes none of that work and changes no existing harness limit.
## 14. Council lenses and evidence boundaries

The local council notes are drafting lenses, not endorsements or independent review: Hashimoto — compose the existing session/commands; Carmack — explicit coordinate transforms and single authority; Schaad — interruption, scrolling, focus and honest persistence feedback; Ryo Lu — reuse clear content/placement primitives; Andy Allen — reversible arrangement without custom physics or a new engine. The council-systems-architecture skill was applied proportionately: keep local data stationary and bound decoding; no distributed or plugin architecture was introduced.

Source locations: `C:/Users/alani/OneDrive/Documents/Aria-EdTech/Learning_Coach_Heroes/Engineering_Council/` and the adjacent `Design_Council/`. The exact five inspected persona files, relevant code, Foundation PRD/ledger and board-catalog reference are hash-bound in `Design Sprints/MOT121-131-Wonder-Next-2026-10-31/input-hashes.json`. Current-code anchors include schema.ts:9/11/39/100/129; session.ts:35/54/99; projections.ts:14; package.ts:23; persist.ts:12; and BoardView.tsx's existing editor/drag callers. No council name implies that person reviewed this proposal.

## 15. Authoritative owner-approved revisions — 31 October 2026

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


Alan’s exact instruction: “Approve G1–G6 as recommended. Record my approval on MOT-131, then have Astra review the revised contract before Muse Wonder implements it. Keep everything local and preserve the harness and production holds.”

The approved revisions above supersede conflicting draft alternatives. All six owner choices are approved; Astra review is pending. Existing holds remain. Opus D1 agrees on position-independent stacking; its automatic duplicate offset reversal (D2) and partial-success paste (D3) are alternatives not adopted by this approval. Rejection without silent relocation and all-or-nothing document insertion remain authoritative. Other prototype-only additions, including multi-select, do not become approved scope through this decision.

## 16. Normative refusal recovery workflow — Astra P1 correction

This specifies the recovery required by owner-approved G6. It adds no automatic placement or wider repair authority. It is a contract obligation, not current behaviour.

1. Discover and identify the selected original store/package before migration. Preserve its bytes and identity without attaching a writer to it. Distinguish absent storage from present-but-invalid or unreadable storage; the latter enters recovery and must not silently select an older snapshot. A corrupt newer candidate may be exposed for backup alongside older candidates clearly labelled as older, without automatically adopting one.
2. On a geometry-only refusal of an otherwise valid supported v1/v2 document, open a local, read-only legacy inspector using version-appropriate validation. Show the original cards, stages, coordinates and source/private content under the same local owner access; show offending IDs and violated bounds. Do not route the original through v3 readers or change its schema marker merely to display it. Unknown/future or corrupt documents get an error and original-byte backup, not guessed interpretation or layout repair.
3. Make the original imported package downloadable unchanged. For a stored trip, expose the untouched legacy document snapshot and available original referenced media, plus a compatible legacy native export when it satisfies the existing package limits. Explicitly report missing media and over-budget exports. A raw document backup is not advertised as a complete media package; do not increase 10 MiB/file or 50 MiB/package limits to make recovery appear successful. The untouched source store remains retained.
4. Provide a separate in-memory repair draft for geometry-only failures. The person supplies replacement x/y for the offending cards; the UI previews old and proposed rectangles and lists exactly which coordinates will change. All retained content, IDs, stage/day/time, scope, provenance, assets and legacy magazine records remain unchanged. No automatic clamp, reordering or offset flip. Defaults apply as approved. Explicit acceptance authorizes only that displayed coordinate repair; cancel/navigation/stale source invalidates the draft without writes.
5. Revalidate the complete accepted draft before writing a separate v3 copy. Do not overwrite the original or merge an interrupted/corrupt v3 candidate into the repair. Publish the copy as usable only after durable save and successful reopen/validation; failure leaves the original and recovery route available. A retry must not silently bless an existing failed candidate. Normal migration retains the original too, at least until the same durable-save/reopen condition is met.
6. Require evidence for refusal → original backup → legacy inspection/export → preview → cancel/accept → durable reopen, including missing media, over-budget backup, failed save and interrupted retry. This evidence is downstream implementation work, not something this documentation review can claim.


Manual coordinate replacement is the minimal explicit repair path. Automatic arrangement, silent older-store fallback, transformed original backups or different repair authority are not authorized. Read-only recovery can expose private content only to its existing authorized local owner; it adds no agent or remote access. All original package/harness limits and production/device gates remain unchanged.
