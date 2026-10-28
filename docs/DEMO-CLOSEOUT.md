# Hackathon demo closeout — 28 Oct 2026

Code revision: **8c22dcb**. Checker: **Codex**, including author checks of its closeout fixes. This is a demo acceptance record, not independent verification or production readiness.

Later product design pass: **eeba470**. See [HANDOFF.md](HANDOFF.md) for the
current interface, 92+ saved-hero lens scores and fresh browser evidence.
This closeout's video and task table remain the historical `8c22dcb` record.

## Scope and owner direction

The owner asked to finish the initial demo, keep the canonical Kanban current and avoid excessive tests and approval gates. Phases 0–5 remain demo scope. Phase 6 was already excluded from demo progress and remains the production go-live backlog. Complete means acceptance-checked with evidence; Verified retains its independent-review meaning. MOT-56 is now the demo evidence pass rather than a mandatory separate review gate. Historical Kanban records are preserved.

## Executed evidence

- Existing check plus two targeted regressions: **319 tests, 46 files, all pass; core/bridge/mot-server/web typecheck passes**. Initial new regressions failed on private/list-order poster pins and incorrect photobook pagination, then passed after fixes.
- Storage browser reproduction: immediate Saved was wrong before the patch. Now immediate **unsaved**, settled **saved**, with IndexedDB completion notification.
- Chromium/Playwright at 1600×1000, 375×812 and a fresh 1280×900 browser profile: board create/edit/move/done/reload, Today edits, photos, backup/share, import, guest-copy selection, Review Stop/late-answer/Peek/partial apply/Undo, postcard and HTML pages all pass. No app console errors or external requests were captured.
- Real postcard decoded at **1819×1311 px, 300 dpi**; low-resolution sample warning observed. Shared ZIP unzipped and Yjs decoded: private card absent, traveler edits retained. Fresh-profile backup import restored photos and survived reload with a new board identity.
- Real sample photobook generated from the exported trip: **24 SVG pages plus cover**, inline photos rendered at **2551×2551 px**, private card absent and low-resolution flags retained. `sample-photobook.zip` and a page preview are in the evidence folder; partner specifications remain unverified.
- Optional local counters: off by default, totals only after opting in; opt-out removes them. No analytics traffic or billed model calls.
- One fault injection: removed the stale-revision guard temporarily. **npm run check failed with 2 assertions**, proving detection; original source restored exactly, then full check green.
- Production bundle builds; no META_API_KEY match. Writer’s Board push URL is DISABLED and a dry-run push fails locally.

Artifacts are in the Ministry of Tourism project folder under `Demo Closeout/`.
The [runtime demo](MOT-58-demo.mp4) is exactly **180 seconds**, **1280×720**,
**4,320 frames** and **2,158,854 bytes**; its contact sheet was visually checked.
The caption continuously labels sample content and the disconnected test adapter.
See the [current handoff](HANDOFF.md) for boot commands and live-service limits.
Browser plugin was not available; bundled Playwright was used.

## Task evidence

| Task | Result | Evidence and limits |
|---|---|---|
| MOT-00 | PASS | Fork ancestry checked at 3e231e4; push URL DISABLED; dry-run push fails locally; FORK.md records separate apps and FCC boundary. |
| MOT-01 | PASS | CODEBASE.md baseline and failures checked against commands, Yjs, undo and package code; current check: 319 tests and four-project typecheck pass. |
| MOT-03 | PASS | npm run check passes; disabling the stale-revision guard makes the same command fail (2 assertions); restored byte-for-byte. Fresh checker followed handoff and browser round-trip. |
| MOT-02 | PASS | SURFACE.md keep/hide table checked; trip route uses TripSession and trip-only gateway; no writing-only tools in AGENT_TOOLS. Existing dormant code retained as documented. |
| MOT-10 | PASS | trip.test.ts and acceptance-gaps.test.ts cover stage/status independence, zone-based Today, version migration, IDs and session authority. Schema/model inspected. |
| MOT-11 | PASS | trip.test.ts, protections.test.ts and REVISIONS.md: revision survives undo/reload; fresh import identity; replay and covered-card checks. Guard mutation is caught. |
| MOT-12 | PASS | TripSession validation and executeAll inspected; protections.test.ts and acceptance-gaps.test.ts prove atomic commands, scoped actors, Solo read-only and separate undo histories. |
| MOT-13 | PASS | Projection tests pass; browser edit in Today is visible on Board and survives reload. Map projection uses supplied coordinates only; projections do not write. |
| MOT-15 | PASS | Reproduced premature Saved; fixed with IndexedDB transaction-completion fence. Browser probe: immediate unsaved, settled saved. Import/guest copies reload; storage error handlers and persisted export timestamp checked. |
| MOT-17 | PASS | Runtime: create task, keyboard edit notes/day/time, mark done, menu move, drag, Today edit and reload all pass. 375px checks pass. |
| MOT-14 | PASS | Core lineage tests cover two copies, private/stay exclusion, conflict preservation, idempotent updates and Keep mine. Browser guest copy excludes unchecked cards and survives reload. Guide-update UI remains a production learning. |
| MOT-53 | PASS | Browser traveler and host first screens exercised; host selected guest-copy flow passes; tour-board path boots in fresh profile. Copies are independent local boards; no host access channel to guest-private data. |
| MOT-30 | PASS | Runtime backup imported into a fresh browser profile: new identity, photos and edits retained after reload. Package tests check selection, manifest hashes and asset sizes. |
| MOT-31 | PASS | import-limits.test.ts, round-trip.test.ts and acceptance-gaps.test.ts pass: hostile archives, sizes before inflation, checksums, fresh identity and imported modes. Runtime import round-trip passes. |
| MOT-16 | PASS | first-board.test.ts passes without provider calls; browser CRUD/move/reload and Today consistency pass. Existing check and stale-guard mutation reject lost/stale behavior. |
| MOT-18 | PASS | round-trip.test.ts and runtime fresh-profile import pass. Both ZIPs unzipped and Yjs decoded: share has no private cards; traveler card and photos retained. |
| MOT-19 | PASS | agent-loop.test.ts and acceptance-gaps.test.ts show deterministic suggestions and simulated failures. Runtime label explicitly says test adapter, Muse not connected. |
| MOT-20 | PASS | protections.test.ts and review-next.test.ts pass atomicity, scope, stale tokens, selective approval and replay. Runtime first and remaining suggestion apply independently. |
| MOT-21 | PASS | acceptance-gaps.test.ts proves proposal-only undo preserves other edits. Runtime Stop ignores late answer; partial apply, remaining apply and toast Undo all pass. |
| MOT-50 | PASS | No provider needed in any runtime board path. Existing timeout/rate/quota/unreachable tests preserve work and provide retry/manual choices. |
| MOT-37 | PASS | city-source.ts and gateway tests inspected: city-bounded Bangkok fixture with source/date, other cities unavailable, unknown prices/routes preserved; no live FCC claim. |
| MOT-22 | PASS | Gateway tests pass selected-board and selected-city restrictions; agent view puts brief/open tasks first. trip-agents.md explicitly excludes approval, payment and publication. |
| MOT-24 | PASS | acceptance-gaps.test.ts and protections.test.ts reject other-board/off-allowlist/private operations; no gateway/proposable tool reaches commerce or payout. |
| MOT-23 | PASS | Server and request/output boundary tests pass; missing key reports unavailable. UI labels Muse disconnected. Built bundle checked for META_API_KEY with no matches. No live model call claimed. |
| MOT-25 | PASS | Runtime Stop, Try again, Peek tool/source/operation, apply one, apply rest and Undo pass; 375px Stop and all button targets checked. No decorative review actions. |
| MOT-26 | PASS | phase4.test.ts passes off-list refusal, budget stop and disabled-mode refusal. Optional library capability; publishing/ordering are not allowed actions. |
| MOT-32 | PASS | Runtime share decoded including Yjs: private card/photo excluded; backup retains originals. Metadata-stripping tests pass. Private photos removed from keepsake picker. Downloaded packages are copies, no revocation claim. |
| MOT-35 | PASS | Real postcard downloaded and decoded: 1819x1311 PNG, 300 dpi, 148x105mm trim plus 3mm bleed. Low-resolution sample warns; original retained and derivative metadata present. |
| MOT-34 | PASS | keepsake tests and mapPins inspected: supplied coordinates and per-pin provenance, missing locations omitted, attribution retained, routes/times explicitly unknown. |
| MOT-33 | PASS | keepsake.test.ts checks copied/frozen snapshots, private exclusion and deletion. Snapshot contains no credentials or board access capability. |
| MOT-36 | PASS | PRIVACY.md reconciled with runtime: local board/photo stores, optional local counters, selected downloads; no external requests captured. Live providers remain unavailable. |
| MOT-40A | PASS | phase4.test.ts plus runtime popup: itinerary renders without AI from board data and excludes private cards. |
| MOT-40B | PASS | phase4.test.ts plus runtime popup: memorabilia renders without AI; private cards excluded and excluded assets filtered. Photo-led postcard is the main demo output. |
| MOT-40C | PASS | Regression now passes: poster pins follow longitude/latitude, private pins excluded; SVG declares 420x594mm with attribution. Explicitly labeled coordinate diagram; basemap and route unavailable. |
| MOT-44 | PASS | PHOTOBOOK.md is concrete: 210mm trim, 3mm bleed, 2551px at 300dpi, 24-page minimum/multiples of four. Partner spec and spine explicitly unverified. |
| MOT-40D | PASS | Regression now passes: 25 content pages pad to 28; trip title/local dates and unverified label embedded. Renderer returns sample cover, inline photo support and per-spread resolution flags. |
| MOT-41 | PASS | phase4.test.ts checks unavailable checkout, duplicate events, browser return never paid and refunds. No live payment/webhook endpoint exposed. |
| MOT-42 | PASS | phase4.test.ts checks refund reversal; hostLedgerView allowlists money/order/state only and never guest identity or address. Commercial terms remain phase 6. |
| MOT-43 | PASS | acceptance-gaps.test.ts checks explicit partner rejection reason and labeled sandbox; absent partner reports unavailable. No actual partner order claimed. |
| MOT-51A | PASS | Existing core failure suites pass. Mutation experiment removes stale revision guard: npm run check exits 1 with two real failures; guard restored and all 319 tests pass. |
| MOT-51B | PASS | failure-checks.test.ts and server tests cover unavailable providers and no invented success; no live integration is falsely recorded as tested. |
| MOT-52 | PASS | Runtime 375x812: no page overflow in Board, Review and Keepsakes, all visible buttons >=44px. Focus/Enter menu movement and Stop exercised. Desktop drag has menu equivalent. |
| MOT-54 | PASS | Implemented optional local demo totals. Runtime: absent by default, opt-in records card/task/proposal/keepsake outcomes, opt-out deletes counts, zero external requests; no live model cost claimed. |
| MOT-55 | PASS | firebase.json inspected: mot-only static hosting, no functions/rules target. Production build passes and dist inventory recorded; no key string in bundle. No deployment performed. |
| MOT-59 | PASS | Review regressions all pass: atomic/stale/private protections, guest-copy and import persistence, traveler export, day/time, partial approval, pre-inflate limits, typed context and Keep mine. Task history fields checked. |
| MOT-60 | PASS | Current screenshots checked against existing rubric: 45/55, reference 43/55. Plex/palette tests pass; supplied wordmark; keyboard move and corrected 44px mobile targets. Self-review recorded honestly. |
| MOT-56 | PASS | Per-task evidence recorded for all 49 demo tasks; author checks distinguished from independent verification. Owner-requested demo completion uses Complete, with Verified retained as a separate status. |
| MOT-57 | PASS | HANDOFF.md names exact code revision 8c22dcb, 319-test check, boot route, package/keepsake artifacts and honest provider list. Fresh checker exercised seeded traveler/host journeys and fresh-profile import. Clean-machine install is outside this demo pass. |
| MOT-58 | PASS | Refreshed 180-second runtime recording, 1280×720/24fps, all seven demo beats, continuous sample/test-adapter labels. Video metadata and contact sheet inspected. |

## Production learnings

1. Passing unit tests did not prove honest saved state, geographic placement or phone targets. Keep one small browser journey and output metadata checks alongside the unit suite.
2. A Yjs update is not an IndexedDB commit. Observe durable completion before promising Saved; storage exhaustion must stay visible. The verification machine actually hit zero free disk space; generated npm cache was cleared and downloads then passed.
3. Public artifact selection needs its own privacy filter. Backups may retain originals; keepsakes and copies to share must exclude private photos and metadata.
4. Keep demo adapters explicitly labeled. Real Muse/FCC data, routing, checkout, partner orders, billing, host payout terms, licensed maps and hosting are phase-6 production work, not verified live services.
5. Guide-update application/Keep mine exist in core; the demo UI still lacks that workflow. The Map is a source-backed pin list; the poster is a coordinate diagram with no basemap/route. Photobook covers are sample layouts without a partner spine template. Production must turn these into complete user flows.
6. Production should use licensed, sufficiently large photography; the concept-derived sample images deliberately trigger print-resolution warnings.
7. Review repeat delivery, stale edits and private context at the command boundary. The mutation experiment showed existing tests catch a removed stale guard.
8. This pass used Chromium and installed dependencies on this machine. It is not a multi-browser/device audit, clean-machine dependency install or a live-provider integration test.
9. Recording pauses must respect live controls: extending the pause before Stop missed cancellation, and extending the pause after Apply let the six-second Undo toast expire. Reading pauses now sit on stable screens; the action timing stays short. These were recording-script failures, not product interaction failures.
