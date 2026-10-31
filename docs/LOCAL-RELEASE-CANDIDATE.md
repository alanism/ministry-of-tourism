# Local release candidate — 31 October 2026

## Current local checkpoint: MOT-120 R23 catalog correction — 1 November 2026

Tested code `a30ab8da84c21bbab94a3e2ab42353331a36f564` gives selected artwork
preview and board insertion the same native bitmap resource slot. The actual
pending-preview/Add probe changes from two outstanding bitmaps to one; late
cancellation and retry keep the slot until the native bitmap closes. No existing
harness or image limits changed. All 1,200 tests /182 files, four typechecks and
the production build pass. See [MOT120-R23-CATALOG-CORRECTION.md](MOT120-R23-CATALOG-CORRECTION.md).

The correction is locally implemented; independent R23 correction re-review is
pending. Earlier REQUEST CHANGES history remains. MOT-119 integration and memory
evidence are retained, as are physical Safari, broader catalog/feature and release
holds. Port 5196 serves the corrected compiled app. No push or deployment.

## Historical local checkpoint: MOT-119 HTML and memory integration — 1 November 2026

Tested code `e26ec8775aee11d7a6e08355eac28c3ebfc0f29b` integrates the two
MOT-119 HTML/larger-trip commits as `7423282` and `f2878c5`, preserving the
existing G6 board/recovery/catalog candidate. Integration regressions correct
board-only media collection, intentionally shared magazine apparel and working-
budget error classification. All 1,196 tests /181 files, four typechecks and the
web build pass; existing harness files remain unchanged.

The combined-bound memory work is recorded in [HTML-MAGAZINE-MEMORY.md](HTML-MAGAZINE-MEMORY.md).
The 87 MiB file exports repeatedly and opens in a fresh offline browser. The
observed process-private peak is about 1.56 GiB; this is not mobile suitability.
The local preview at port 5196 now serves this integrated candidate. Physical
Safari stays pending. MOT-120's existing R23 catalog review requests changes;
that finding and all broader feature/production/release holds remain open.
No push, deployment or PDF work.

## Historical local checkpoint: MOT-120 direct catalog insertion — 1 November 2026

Tested code `b11909964b26e7ec02efdfe726af797349867339` adds **Add FCC art** to
the free board, reusing the existing catalog picker. Selected originals create
private board presentations with source credit, rights, crop and original bytes
intact. Geometry uses the approved square board coordinates. Existing header
art insertion into Composition remains unchanged. Actual Muse Wonder authored
this slice in three recorded calls; independent review of this slice is pending.

All 1,181 tests in 175 files, four TypeScript projects and the web build pass.
Fifteen new tests are additive; all pre-existing harness files are unchanged.
Local Chromium checks cover pointer/keyboard/mobile touch, focus return,
Undo/Redo/reload/native ZIP, close/reopen and leave/return during download/decode,
hash rejection, committed saving and quota recovery. Existing free-board/R21
browser checks pass. A deliberate wrong-surface mutation was caught and restored.
Catalog/media URLs were fulfilled from deterministic local fixtures, not live
supplier requests; this does not establish production catalog coverage or rights.

MOT-120 remains In progress: cross-board clipboard and broader independent,
human/device/performance acceptance remain open. The harness, G6 recovery,
owner/Astra geometry contract, privacy, production and PDF holds are preserved.
No push or deployment. Evidence: `Design Sprints/MOT120-Wonder-Catalog-2026-11-01/`.

## Historical local checkpoint: MOT-120 R21 corrections — 1 November 2026

Tested code `896b0c813eec720f53c3db139db0b9777e56efb8` corrects EXIF-oriented
JPEG dimensions, the image insertion/save cancellation boundary, and decoder
resource exclusion across cancellation and retry. Actual Muse Wonder authored
the patch. Actual Astra independently re-reviewed this exact commit and issued
**APPROVE FIXES** for R21-1, R21-2 and R21-3; no new actionable regression found.
This is acceptance of those corrections only, not full MOT-120 acceptance.

All 1,166 tests in 174 files, four TypeScript projects and the web build pass.
The 24 new tests are additive; all 191 pre-existing harness file blobs remain
unchanged. Existing desktop/mobile browser scripts and new native JPEG, delayed
storage, cancellation/retry checks pass. Astra additionally checked all eight
EXIF orientations in both TIFF byte orders, working Undo/Redo during saving,
native decoder rejection and queue recovery. Original bytes remain intact.

MOT-120 stays In progress. Cross-board clipboard, direct catalog insertion and
all broader definition/privacy/human/device/performance/production/PDF holds
remain. No push or deployment. Evidence and independent disposition:
`Design Sprints/MOT120-R21-Wonder-Fixes-2026-11-01/ASTRA-REREVIEW.md` and
`RESULTS.md`. Extension rules remain in the free-board coding reference below.

## Historical local checkpoint: MOT-120 free-board interactions

Tested code `35f642fd2f43b907855a45366d88a488c475e177` adds the main free board,
optional lanes, local gesture previews, movement/resizing/layers, readable card
editing, human-only duplicate, same-board clipboard, private text capture and
bounded image insertion. Actual Muse Wonder implemented this slice. All 1,142
tests in 172 files, four TypeScript projects and the web build pass. The 33 new
tests are additive; every existing harness file and assertion is unchanged.

Local Chromium checks cover desktop pointer/keyboard, Undo/Redo/reload, native
package media/geometry, stale edits, cancellation across leave/return, invalid
second images, locked images, quota recovery, tiny-image selection and a 390px
50-object emulated touch flow. Two injected faults were detected. Browser plugin
was unavailable; installed Playwright used isolated contexts and loopback-only
requests. No physical-device, Safari, peak-memory or independent acceptance is
claimed. Details and extension rules: [free-board coding reference](MOT120-FREE-BOARD-INTERACTIONS.md).

MOT-120 remains In progress. Cross-board clipboard graphs, direct catalog-to-board
insertion and broader human/device/independent acceptance remain open. The G6
implementation and owner/Astra geometry disposition are preserved, along with
all existing definition, privacy, production and PDF holds. Nothing pushed or
deployed. External evidence: `Design Sprints/MOT120-Wonder-Interactions-2026-10-31/`.

## Historical local checkpoint: MOT-120 G6

Tested code `de02965b2672068553af606e39e00a9ffac6b9f1` adds approved schema-3 migration and explicit local recovery to the prior geometry foundation (`3caf1cb`). All 1,109 tests, four TypeScript projects and web build pass. Seven recovery scenarios plus native source-race, save-abort/retry and cancellation checks pass in isolated Chromium contexts. Only the two explicitly approved existing version assertions changed; all other harness settings and assertions remain intact.

See [MOT-120 G6 evidence](MOT120-G6-MIGRATION-RECOVERY.md). MOT-120 remains In progress for free-board interactions and broader acceptance. Existing production, independent definition/privacy, physical-device and PDF holds remain. No push or deployment. Earlier checkpoints below are historical, not assertions about the current schema.

## Historical WP6 checkpoint: requested revision 0355bb6

The current local code checkpoint is
`169ddc9f3881b5a9939180678dc6921cb8a9979a`, merging exactly
`0355bb66ba3499a330c713d4cd36de6e8006c193` into `568ce6a`. It brings the bounded
catalog metadata session cache, readable horizontally scrollable phone summary
tables, and the verified public guide URL contract. All eight incoming files
match their source commit blobs. Of 2,624 previously tracked files, 2,618 remain
unchanged; six change and two files are added. Existing final Muse diagnostics,
ledger durability and uncommitted source-worktree work are preserved.

The owner explicitly authorized retaining the exact committed URL expectation
updates in `guidance.test.ts` and `workflow-routing.test.ts`. Those two files are
byte-identical to the requested source; every other existing harness file,
configuration, timeout, dependency and release-gate rule remains unchanged.
Before implementation, the incoming cache tests reproduced five failures and
seven passes; incoming guide expectations reproduced two failures and 16 passes.
Original files were restored before the merge. After integration the unchanged
default **`npm run check` passes: 902 tests / 162 files**, followed by all four
TypeScript projects. Test execution: 33.66 seconds. The production web build
passes in 3.07 seconds with existing advisories. Earlier ledger CLI timing
failures remain historical observations; its implementation and timeout were
not changed, and no timing-flake fix is claimed.

Sandboxed Playwright was used because the Browser plugin is unavailable. Local
browser verification uses loopback resources and declared transport fixtures:

- At 1440/375, art-picker reopen makes no registry/manifest request even with
  browser HTTP caching disabled, while city/category catalogs still refresh.
  The board remains identical. Twelve cache regressions cover opt-in scope,
  schema/fetcher isolation, five-minute TTL, backwards clocks, 32-entry bounds,
  clones, forced refresh, invalid data and cancellation.
- Real WP8 response exchange/tally/fairness/Apply/Undo/offline checks pass with
  all original assertions retained in an external probe. Added phone checks
  verify single-line headers and a 520px table scrolling inside 337px/242px
  containers at 375/280. Screenshots were inspected.
- The unchanged canonical WP9 runner stops at its obsolete null guide-URL
  expectation. That failure is retained; no canonical-runner pass is claimed.
  A separate external probe changes only that expected value to the exact
  approved URL and its matching success description. All other assertions and
  steps remain. Its eight native steps/eight layouts pass, including ordinary
  local guide GET byte parity, privacy, Today, fixed bookings, memories,
  HTML/JSON/ZIP and deliberate storage-fault recovery. Only expected injected
  AbortErrors occur inside its fault window.
- Four development/built-origin helper runs at 1440/375 pass exact-byte photo
  import, canvas non-taint and durable reload/hash checks, with zero unexpected
  external attempts. No production URL was fetched. This is local fixture
  evidence, not fresh public-FCC CORS or physical-device acceptance.

All four complete implementation hashes in the producer's fixed-performance
source binding match the integrated worktree bytes exactly. Its existing
measurements therefore retain their source provenance. No fresh timing-budget,
network, cold-start or physical-device result is claimed. Existing 4s/2s boundary
self-tests and all 11 unchanged release-gate self-tests pass.

On frozen board save192, genuine source integration reduces the unchanged gate
from 39 live / 37 manual errors with 27 absent latest references to **three live /
one manual errors, zero ancestry gaps and zero record-format errors**. Release
remains blocked: live Muse key setup/A14 and MOT-100 physical acceptance are not
cleared. MOT-100/MOT-101 remain Implemented; their device-pending scope, prior
owner-authorized hold resolutions and every task/review record are preserved.
The board update changes only the separate local-candidate banner and metadata.
Save193 is written and rechecked at 1440/375 with all 50 task records unchanged.
Applicable A16–A20 still require the existing supplemental evidence and acceptance;
the legacy gate's A01–A14 coverage is not expanded or waived.

This task performs no push, deployment, paid/provider call, credential handling,
PDF work or new production acceptance. The public guide URL is the imported
contract, checked locally, not a new deployment or fresh production verification.
Raw evidence is beside the canonical plan in
`Design Sprints/Local-WP6-0355bb6-Integration-2026-10-31/`.

## Prior requested integration: d23b163

The current local code checkpoint is
`884bcf357426f532c5f08f19b7bc1ce82ee511d7`, merging exactly
`d23b16308749443fddf708844839dfe7a1809de0` into the previous local candidate
`c3e62da`. All **2,622 previously tracked files retain their Git blobs** across
this merge. Six incoming files already matched byte for byte, including the
thumbnail implementation/test and performance/loading tools. Only the app-only
origins runner and its documentation are added. Existing harness files,
application behavior, final Muse diagnostics and ledger durability are retained.
The later `2a9dbe8` / `0355bb6` work and source-worktree uncommitted edits are not
part of this requested revision.

The unchanged default `npm run check` was run twice. Both runs reached
889/890 passing tests and timed out in the existing five-second unfamiliar-reply
ledger CLI test. The CLI file then passes **7/7 in isolation** in 7.84 seconds;
the complementary **160 files / 883 tests** pass in 29.98 seconds, with the same
assertions and timeouts. All **890 tests / 161 files** therefore pass across
complementary runs. All four TypeScript projects and the production web build
pass (5.46 seconds; existing chunk-size advisory). The default-command timing
failure remains a local limitation; no timeout, worker configuration, existing
test or durability implementation was altered to hide it. Revisit this empirical
timing failure on 30 April 2027; no automation is created.

The new runner's nine fail-fast configuration cases pass without a browser or
network. Its unchanged negative CORS CLI self-test verifies denied fetch,
tainted canvas and a positive control using loopback servers. The exported
`testOrigin` helper passes four runs: development and built loopback apps at
1440/375 pixels. All helper assertions remain intact. An external fixture driver
supplies the viewport and explicit loopback feed/manifest/image resources;
background destination tags use declared local placeholders. Actual photo file
selection/import, canvas non-taint, exact original-byte hash, save/reload,
nonblank page identity, framework-overlay absence and runtime errors are checked.
Screenshots were inspected. Browser plugin is unavailable; sandboxed Playwright
was used. No requests reached external hosts, providers or production services.
This is local helper verification, **not** a full public-FCC CLI origin pass,
fresh production CORS acceptance, timing-budget acceptance or physical-device
evidence. The initial denied-background-image fixture run is retained separately.

Against frozen board save189, the unchanged release checker still reports
17 live / 15 manual errors, while the one absent latest revision (`d23b163`)
becomes a genuine ancestor and record-format errors remain zero. Its 11 self-tests
pass; existing 4s/2s performance boundary tests pass without a new timing claim.

The board advanced independently to save191 while checks ran. That session's
`0355bb6` production acceptance records, Implemented WP6 statuses, device-pending
scope and owner-authorized hold resolutions are preserved verbatim. A separate
local-candidate banner/metadata receipt records this older requested checkpoint;
it does not replace those newer acceptance records or claim their source is
integrated here. The unresolved Muse key hold remains. This task makes no status
promotion, production approval, deployment, push, credential use, paid model
request, guide activation or PDF claim. Raw evidence is local:
`Design Sprints/Local-WP6-d23b163-Integration-2026-10-31/` beside the canonical plan.
Board save192 records the local checkpoint in a separate banner and metadata;
all task/review records remain unchanged. Against the newer board snapshot, the
legacy gate remains blocked with 39 live / 37 manual errors and 27 later-source
references outside this candidate. Those newer acceptance records are retained,
not relabelled as acceptance of this older source. Saved-board checks pass at
1440/375 without changing its existing overflow or model-suggestion warnings.

## Prior consolidation checkpoint (5e15f7c)

The tested code is `5e15f7c0e7a5c00062c5ecf4dba5095fa8f9a8b4` on
`codex/local-release-consolidation-20261031`. This is an isolated local candidate,
not a new release authority or deployment. Public `main` remains authoritative.
No push, deployment, credential use or paid/live model request was performed by
this consolidation. Other sessions' deployment and acceptance claims remain
their own records. Production holds and owner PDF closure remain in force.

## Committed inputs and merge decisions

| Input | Treatment |
| --- | --- |
| `5b283b68bdc381867d7b0e98f228bd7e40c90019` | Public source snapshot: WP2, original 150-second demo, WP4 and earlier W1–W6 integration |
| `ca8a715ad43e0a29fdec36d28a88abbc1d01acb4` | Final local Muse authentication/private diagnostics and ledger replacement durability; merged at `7300928` |
| `06c8ecfd89901fa1da5f944352c988849da1b80e` | Bounded visible-thumbnail recovery and app-only performance tooling; merged at `1e1d1e0` |
| `939ff96bb11549bb01285dffcb3ec84df3ca0cc4` | Subsequently committed WP5 ZIP recovery and responsive fixes; merged at the tested revision above |

All four inputs are actual ancestors. The public Git root remains
`1b1b1fab24cf1054c37008705e6f4227d58c450c`. No unrelated private history was
imported. Active worktrees and uncommitted edits were left alone.

The Muse conflict resolution retains current public source citations and command
formats, adds typed authentication failure, and retains explicit disclosure of
local private diagnostics. WP8's split reply/stamp columns and tested tally
behavior remain. Public browser runners retain their existing assertions and
bytes. Local transport setup lives outside the repository.

The ledger barrier uses POSIX rename plus directory fsync, or Windows
`MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)`. Fault injection verifies honest
uncertain-durability reporting after replacement has been attempted. This is
local implementation/verification, not a physical power-loss certification.

## Mechanical and browser evidence

Before integration, incoming regressions reproduced the missing Muse/ledger
behavior, thumbnail loading state, and WP5 diagnostic behavior. Original source
was restored after each RED run; only committed input changes were then merged.
No assertion, timeout, type rule, dependency or harness setting was relaxed.

- Final default `npm run check`: **890 tests / 161 files pass**, followed by all
  four TypeScript projects. Test execution took 44.79 seconds.
- Final production web build passes in 5.07 seconds; the existing chunk-size
  advisory remains. Release checker self-test: **11/11 pass**.
- All 28 protected baseline configuration/manifest/PDF files are byte-identical
  to `5b283b6`. Of 196 existing test/QA files, 194 are byte-identical; the two
  changed files retain every existing non-import line and add Muse/ledger
  regressions. New regression files and existing performance tooling are added.
- The original demo video and poster Git blobs are unchanged. The final
  production-bundle scan found zero provider URL, server-key variable or
  fictional credential-canary occurrences; no real credential was opened.
- On the final candidate, unchanged WP8 and WP9 browser runners pass actual
  response JSON/ZIP exchange, deterministic tally/fairness, selective Apply and
  exact Undo, privacy, storage recovery, protected bookings, Today adjustments,
  memory and HTML keepsakes. WP9's deliberate storage-fault AbortErrors are
  expected only inside its fault window.
- Final built-root smoke passes at 1440/375: travel entry without a query string,
  no hidden Writer database, empty new trip and durable reopen.
- Final Muse grounding passes 48 state/width checks. The nine runtime fixture
  modes passed another 54 checks at `1e1d1e0` before the WP5-only merge. Final
  real local HTTP-fixture checks cover exact request projection, private-card
  exclusion, partial Apply/Undo, typed authentication, Stop reaching the server,
  honest sample attribution and private diagnostics deletion. External provider
  calls: zero. Its deliberate authentication fault produces one expected 502.
- Final ballot browser checks pass keyboard Home/ArrowDown/Enter, four widths,
  persistence and native touch/offline response import. This satisfies R15-4's
  pending browser follow-up; static-render unit tests remain static-render tests.
- Final ZIP browser checks verify actual downloaded bytes/hash, reload/offline
  recovery, five widths, safe error/receipt content, retry, no early/late cancelled
  download, quota fallback and an unchanged board.
- Final scoped art consumer checks pass at six widths, with actual public FCC
  raster bytes supplied as explicit local transport fixtures: preview, retained
  origin/credit, explicit Add/Undo, no new venue/Writer writes, native ZIP
  credit/hash retention, focus/Escape, bounded retry and failed-original recovery.
  The original art runner's PDF tail was excluded in an external derived probe;
  a full original-runner or PDF pass is not claimed. Earlier absence and virtual
  20-second loading/offscreen/retry checks passed at `1e1d1e0`.
- Destination creation passed 30 state/width checks at `1e1d1e0`, including
  single-flight creation, seven retained sources and included-list offline aliases.

Current phone root, art preview/loading, narrow ballot and ZIP screenshots were
inspected alongside DOM geometry checks. Browser work used sandboxed Chromium,
not physical iOS/Safari. The cached-feed fixture initially used a disallowed
localhost feed URL; setup was corrected outside the app to route the approved
public URL. The product URL allowlist was unchanged. These transport fixtures
are not production FCC/CORS or live Muse evidence.

## Evidence reconciliation and remaining gates

`LOCAL-RELEASE-EVIDENCE.json` maps every card from the frozen board snapshot,
its latest recorded revision and historical references, actual candidate ancestry,
fresh verification scope and other-session claims. Original implementation,
independent-review and owner-approval records are retained.

Seven completed app cards (MOT-69/71/72/83–86) receive narrowly scoped current-code
self-check records. Their original private hashes remain historical references,
not newly manufactured ancestors. Prior independent art reviews are not repeated
or re-scored. MOT-99 and supplier cards MOT-73–75 already have newer claims from
another active session; those are preserved rather than replaced. A claim record
does not establish supplier publication, CORS, geography, or source provenance.
Older supplier references `4efe907` and `56a5f37a` remain unreconciled as supplier
source; no FCC repository or publication was changed by this task.

No card status, blocker, assignment, design requirement, guide URL or PDF closure
is changed. MOT-101 stays Doing. Group cards stay Integrated. R15-4 is closed
only as a completed local browser follow-up. Fresh evidence is self-check evidence;
no card is marked Verified.

Against the same frozen board save 187, merging source reduces the legacy live
gate from 43 errors (31 absent latest revisions) to 30 errors (seven absent).
The seven fresh consumer verification records reduce it to **17 errors, zero
absent latest revisions and zero record-format errors**; manual-only mode has
15 errors. Release remains blocked. Several newer records are other sessions'
pending claims, so a zero ancestry count does not settle their evidence or the
older supplier provenance. No gate logic or acceptance rule was changed.

The board then advanced to save 188 during validation. Its newer owner-directed
WP6/device record references `d23b163`, outside this frozen candidate. The update
is rebased onto that save without overwriting it; MOT-100's later source reference
remains an explicit pending input. This task neither imports unfinished WP6 work
nor reverses that session's direction to perform physical-device checks in parallel.
Saved board 189 therefore retains one absent latest revision, MOT-100's
`d23b163`; the final gate still has 17 live / 15 manual errors and no record-format
errors. Desktop/mobile saved-board checks pass without increasing the board's
pre-existing horizontal overflow or changing its three model-suggestion warnings.

The unchanged legacy release checker covers A01–A14. MOT-101 additionally requires
applicable A16–A20; they are mapped below and remain subject to card acceptance.

| Check | Local functional evidence | Remaining boundary |
| --- | --- | --- |
| A16 | `response-ledger` / CLI / group tests; real WP8 JSON/ZIP, conflict/stale/privacy checks | Required card acceptance |
| A17 | `group-ballot`, `preference-tally`, preferences tests; keyboard/touch and real 60-point WP8 example | Required card acceptance |
| A18 | `schedule-feasibility`, `group-plan-review`, group tests; real WP8 fairness/coverage and exact Undo | Required card acceptance |
| A19 | `booking-attention`, workflow tests; real WP9 dated Today adjustments and fixed-booking protection | Required card acceptance; no purchases/cancellations authorized |
| A20 | `guidance`, `workflow-routing`, native-group, memory/keepsake tests; real WP9 HTML/JSON/ZIP/privacy/recovery | Permanent guide URL remains unset; required card acceptance |

Production Muse ingress/key setup, per-user authorization/spending controls,
production diagnostics permissions/retention, performance/device evidence,
supplier production smoke, preview rollback and owner release approval retain
their existing holds. This candidate does not accept any active session's pending
claims or inherit its deployment authorization. Owner approval of MOT-95 screenshots
remains local design acceptance, not an Opus review or production authorization.

Raw local evidence is stored beside the canonical plan in
`Design Sprints/Local-Release-Consolidation-2026-10-31/`. The immutable code
revision above is the test target; a later documentation-only commit does not
change that code. The local reconciliation receipt records the exact board save
and checker outcomes. Do not infer release approval from passing local checks.
