# WP10 adversarial task-definition review

Reviewed 31 October 2026, Asia/Bangkok. Input: canonical board save **194**, MOT-119–129. Source inspected: local candidate **79b602f81adf1129b1aaf81119faf2e4ba34c030**, with code checkpoint 169ddc9 and requested WP6 input 0355bb6. This is a **Muse Wonder-authored planning review**, using the supplied council documents as analytical lenses. It is neither a review performed by those people nor a Muse Wonder invocation, independent verification, feature implementation or production audit.

The eleven outcomes are worthwhile and remain required launch scope. The definitions need stronger boundaries before implementation, especially shared/private state and household authority. No existing acceptance, device/production hold, owner decision or PDF closure is overturned. MOT-118 is outside this batch. No source implementation or existing harness is changed by this review.

## Read only the relevant reference

| Cards | Reference | Purpose |
|---|---|---|
| 125, 126, prerequisite 130 | [Shared rooms](SHARED-ROOMS.md) | Trust boundary, identity, merge/Undo, media, limits and recovery |
| 119–122, 127, prerequisite 131 | [Board, catalog and export](BOARD-CATALOG-EXPORT.md) | Data/interaction contracts, complete discovery, safe portable output |
| 123, 124, 128 | [Voting and agent handoff](VOTING-AND-HANDOFF.md) | Owner decisions, ballot semantics, human journeys, capability truth |
| 129, prerequisite 132 | [Acceptance and evidence](ACCEPTANCE.md) | Feature-to-probe matrix and release-gate coverage proposal |

These are coding-reference notes, not permission to implement undecided interfaces, alter immutable harness settings, deploy, spend, contact providers or process real private trips. Read the repository's current AGENTS/FORK/CODEBASE first. Revalidate the exact file locations and revision when work starts. The current source is a reference, not a claim that the local candidate contains every later production commit.

## Findings filed as R20

All findings stay open until the relevant decision or implementation proof exists. Incorporating a requirement into a task is not fixing the feature. Severity is the consequence if the gap survives implementation, not a claim of an exploitable deployed feature.

| ID | Severity | Cards | Failure scenario and required correction |
|---|---|---|---|
| R20-1 | Blocker | 125, 126, 130 | Publishing the existing Yjs document exposes private maps/metadata. Define a separate, allowlisted shared-state boundary; never upload a filtered-looking copy of the entire local document/history. |
| R20-2 | Blocker | 125, 126, 130 | A client bypasses TripSession and submits forged binary updates, household IDs or roles. Specify server-enforced write validation and authenticated membership/household binding; a local actor label is not authority. |
| R20-3 | Major | 125, 126, 130 | Revocation blocks room metadata but a media bearer URL, cache or late upload remains useful. Include storage access, invite redemption/replay, session changes and staged uploads in the trust boundary. |
| R20-4 | Major | 126, 130 | Concurrent local revision increments collide; raw remote updates bypass revision stamping, or Undo reverses another member's edit. Define sync/revision/Undo semantics together and retain rejected local changes for recovery. |
| R20-5 | Major | 120, 122, 126, 131 | Lane ordering, normalized presentation placement and magazine layout become competing sources of geometry. Decide the authoritative coordinate/identity/migration contract before building the canvas. |
| R20-6 | Major | 120, 131 | An asynchronous paste finishes on the wrong board or a cancelled drag leaves partial media/history. Specify bounded clipboard formats, board-bound cancellation, atomic commit and non-drag controls. |
| R20-7 | Major | 121, 122, 127 | “Eligible” is defined after counting, making missing categories disappear from the denominator. Freeze inventory and operation-specific eligibility with reasoned exclusions and preserve the existing credited-art owner policy. |
| R20-8 | Major | 122 | Search claims no results because relevant shards were never fetched; a late filter response inserts the wrong asset. Prove exhaustive identity reachability independently of loading and key Add to stable identity. |
| R20-9 | Major | 119 | A visually correct HTML still contains private JSON, SVG/CSS external references, metadata or executable imports. Validate the complete delivered byte graph and actual offline file, not just screenshots. |
| R20-10 | Major | 119 | Live edits mix revisions during export; base64 expansion and decoded images exceed memory despite a small source size. Freeze one snapshot, declare byte/decode bounds and prove cancellation/failure without false success. |
| R20-11 | Blocker | 123, 124 | “Ranked voting” silently changes outcomes or tie/close rules after responses. Obtain the owner-reviewed method and lifecycle decision, preserve historical positional scoring and use independently calculated fixtures. |
| R20-12 | Major | 124, 125, 126 | A same-name household or imported response claims authority; “Saved” is mistaken for delivery or final consent. Define identity resolution, local/portable/server acknowledgements and unassisted human comprehension checks. |
| R20-13 | Major | 127 | A fabricated variant/deep link is presented as buyable or leaks invite/trip context. Bind each handoff to the audited source, allowlisted destination and truthful fallback; no invented checkout. |
| R20-14 | Major | 128 | A guide announces tools before they exist or an older/offline package implies room write access. Bind versioned capabilities to actual callable commands; file possession and guide text confer no authority. |
| R20-15 | Major | 119–129 | Pending definition reviews do not affect the board's Ready predicate or copied implementation brief. Add visible build blockers and reference notes so pending Muse Wonder/owner decisions cannot be mistaken for a start signal. |
| R20-16 | Major | 129, 132 | The current release checker loops over A01–A14 (A01–A13 manual-only), not A21–A27. Existing mandatory-card checks still help, but do not prove expanded criterion coverage. Propose an owner-approved gate contract and negative controls; preserve the harness until approval. |

## Council lenses actually used

Sources are the owner's local synthesis documents under `C:/Users/alani/OneDrive/Documents/Aria-EdTech/Learning_Coach_Heroes/`; their quotations and claimed biographies were not independently researched. Source hashes and inspected code anchors are retained in the review evidence folder.

| Local source | Applied challenge | Deliberate limit |
|---|---|---|
| Engineering: `mitchell_hashimoto_coding_hero.md` | Compose existing primitives; repeat/recover interrupted work; prove the actual file/client boundary. | No self-hosted collaboration rewrite or blanket new process framework. |
| Engineering: `john_carmack_coding_hero.md` | Explicit data shapes, bounds, pure transforms and few owning layers. | No unrelated language rewrite or adjacent cleanup. |
| Engineering: `jeff_dean_coding_hero.md` | Budget actual bytes, requests and reconnect work; fail honestly under bounded load. | No hypothetical global-scale sharding or speculative hedging. |
| Engineering: `andrej_karpathy_coding_hero.md` | Small independently testable steps; reject a demo as full-corpus proof. | Existing product scope is not reduced to a demo. |
| Engineering: `simon_willison_coding_hero.md`, `nicholas_carlini_coding_hero.md` | Treat compromised clients and imported notes as untrusted; enforce authority outside the model. | No claim that prompt warnings, human-only labels or schema checks provide remote authentication. |
| Engineering: `ryan_lopopolo_coding_hero.md` | RED/GREEN, negative controls and durable reference notes for recurring errors. | Existing harness is owner controlled; propose changes separately instead of weakening it. |
| Engineering: `lauren_tan_coding_hero.md` | Revision-bound evidence, real user surfaces, single write path, author proof separate from independent review. | Council names do not create reviewer independence. |
| Engineering: `raphael_schaad_coding_hero.md` | Loading, interruption, touch, focus and truthful feedback are part of the design. | No hidden hover-only tools, decorative polish project or adjacent cleanup. |
| Design: `ryo_lu_design_hero.md` | Simple entry, progressively disclosed detail, one set of primitives, inspectable action/results. | Show decisions and effects, not private model reasoning or a second agent-only application. |
| Design: `andy_allen_design_hero.md` | Reversible tactile arranging; keep holiday planning playful and humane. | Accessibility and predictable controls take precedence over animation or surprise. |
| Design: `jayse_hansen_design_hero.md` | Users immediately understand whose trip, vote and sync state they are viewing. | No cinematic display density or film-specific micro-animation requirements. |
| Design: `gmunk_design_hero.md` | Tangible controls and consistent visual structure on real screens. | No tiny typography, rigid canvas grid or visual effects mandate. |
| Design: `AD-CPBogusky-Playbook(3).md` | The promise is proved by finding, arranging, sharing and taking the holiday home. | Marketing claims must follow working behavior; no campaign or web-research task added. |

The two applied local skills are `Engineering_Council/skills/council-adversarial-verification/SKILL.md` and `Engineering_Council/skills/council-systems-architecture/SKILL.md`. Their relevant threat-boundary, replay, boundedness and verification principles are applied proportionately to this planning review. No implementation or external operations are authorized by those files.

## Implementation order and owner decisions

1. Finish definition review and record the actual reviewer identity. The requested Muse Wonder gate remains pending; this Muse Wonder review is additional evidence.
2. MOT-121 can establish the catalog denominator after its definition gate. MOT-130 settles shared authority and limits; MOT-131 settles board geometry/interaction. MOT-123 settles the voting method. These decisions can proceed independently without editing the same source files.
3. Implement export, board, discovery and voting in their existing tasks after prerequisites. Rooms and sync follow the approved shared contract; the human portable voting path remains independently useful.
4. MOT-132 proposes the owner-controlled acceptance coverage; MOT-128 updates the single guide/capability source only as behaviors land. MOT-129 checks one pinned expanded candidate. No duplicate release gate replaces MOT-101.

Decisions needing an owner disposition: voting purpose/rule/weights/ties/close-and-reopen behavior; guest roles and household delegation/recovery; acceptable free-service bounds/retention behavior; and any media/font fallback that changes the promised output. Recommendations and options are recorded in the relevant notes. They are not silently selected on the owner's behalf.

Validation of this review means preserved historical records/holds, valid board data/dependencies, working rendered cards/review/search/reference links and unchanged application/harness source. It does not mean that any WP10 feature passed.
