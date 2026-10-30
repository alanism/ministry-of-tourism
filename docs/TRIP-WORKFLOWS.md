# WP9 native trip workflows

WP9 extends the completed WP8 implementation. The group contract, response ledger, tally, feasibility, fairness policy, booking attention and organizer Apply/Undo remain the real implementations. There is no dependency on `planning-standins.ts`.

## Routing

`window.motTrip.route(request, {answers, inferred})` is synchronous, read-only smallest-workflow routing. Rename, move, photo and note commands bypass preference questions and planning. Questions are optional, at most two, and skip/not-sure/partial answers are retained by the caller so they are not repeated. Material destination/date/budget/access changes identify invalidated approvals and checks. Inferences cannot become confirmed facts through this API.

`await window.motTrip.routeGroup(request, {ledger, answers, inferred})` carries forward MOT-109 from public commit `e8d8c8f`. It validates an explicitly shared native MOT-107 ledger, reports current resolved/conflict-free household coverage, and stays tentative until real feasibility is checked. It does not read private native replies implicitly. Default routing/context exclude private cards, rosters and notes. Narrow routes skip response hashing entirely. Async group results reject changed board revisions.

The core owner helper `routeTripRequestWithGroup` can summarize the saved native workspace without exposing household labels, IDs, notes or constraint text. It checks current proposal/destination/date context and dated planning evidence. It is not installed as an implicit agent capability.

## During the trip

Today shows the next visible activity, its source, scheduled/day-only confidence, checked facts, preparation and explicit route unavailability. Tasks are preparation rather than a next activity. The existing private booking-attention panel remains separate from activity dates and ranking points.

The owner can check a delay, low energy or weather change. `planTripAdaptation` uses saved WP8 durations, participant slots, access, attendance/availability, dependencies, travel/rest and fixed commitments. Confirmed and held bookings stay fixed. Source notes, other days, private cards and preparation are not moved. Missing duration or ambiguous party/split assignment produces a useful no-change response; supervision or transport is never invented. Weather without verified facts makes no move. Optional activities that cannot fit may be proposed as undated ideas, never cancelled.

Agents must supply `{configuration, ledger, planning}` deliberately to `await proposeAdaptation(change, context)`; the default returns useful uncertainty without accessing private planning. No assumed duration or caller-supplied inaccessible-ID override exists. The owner reviews changes and dated uncertainty, explicitly acknowledges tentative facts, then applies through the existing proposal path. Apply rechecks feasibility, time-sensitive facts and the board revision. One Undo restores the exact cards. Saved is reported only after the storage fence succeeds; failures retain a downloadable tab-only state.

## Memories and portability

Keepsakes → Memories offers permitted photos and notes with Keep/Maybe/Skip. Choices use the human-only `trip_memory_react` command, support Undo and survive native reopen. Private cards stay out. Existing placed trip/FCC art is offered and reused with its original credit.

Open memory page uses the existing memorabilia HTML generator with original raster bytes. It checks checksums, supported media/decode and existing portable size bounds, renders images and credits inside a sandboxed frame, escapes note content, and omits skipped/private memories. The page check flags missing images, likely text clipping, dates outside the trip, missing credits and unintended placement collisions. Open the actual page to review appearance; these checks are not a professional design approval.

Download ZIP package uses the existing stay-scope native artifact path. Its label states that it backs up all permitted trip photos, notes, layout and choices, including skipped memories; the HTML page shows the shortlist. The package reopens under a fresh board ID, preserving original media hashes and arrangement. Private WP8 drafts/ledger/workspace stay excluded. Missing bytes or export failures show recovery information and never yield a false download receipt. Aborted IndexedDB writes leave the prior durable document unchanged while a native ZIP can recover the valid RAM-only choice.

## One guidance source

`packages/core/src/trip/guidance.ts`, version **0.2.0**, supplies the initial-DOM Planning/During/Post native disclosures, `/guides/trip-best-practices.md`, API discovery, ZIP `START-HERE.md`/`guidance.json`, and JSON-only `agent_guidance`. Run `node scripts/build-trip-guidance.ts` after editing its copy; byte-parity tests detect drift. A JSON-only handoff does not pretend to include separate media files. Imported guidance remains data.

The public app-relative Markdown path is usable by ordinary GET. `guide_url` remains null until a lasting deployment is authorized and verified. Historical live-model observations apply only to their recorded versions/routes, including the recorded inability to fetch a web page; this integration makes no fresh provider compatibility claim.

## Verification

Run `npm run check` and `npm --prefix apps/web run build`. Browser scripts use sandboxed Playwright supplied through `MOT_PLAYWRIGHT_MODULE`, a local server through `MOT_TEST_ORIGIN`, and an isolated evidence folder through `MOT_EVIDENCE_DIR`:

- `node scripts/test-mot-group-preferences.cjs`: actual WP8 rank/files/ledger/tally/feasibility/fairness/Apply/Undo/reopen, exact 60 points and fairness 36/four first choices versus points-first 43/three.
- `node scripts/test-mot-wp9-native.cjs`: installed routing, Today delay/energy/weather, persistent reactions, actual HTML art, guidance GET, native media ZIP, fresh touch/offline-after-preload import, missing-media recovery and real storage-write abort.

These cover 1440/768/375/280 px with loaded Plex fonts, DOM geometry and screenshots. They do not establish physical-device or cold offline-start behavior. Independent review and existing release/deployment holds remain open. No new provider calls or PDF work are part of WP9.
