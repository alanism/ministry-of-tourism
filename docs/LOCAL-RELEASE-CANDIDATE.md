# Local release candidate — 31 October 2026

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
