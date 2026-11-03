# MOT-132 — proposed A28–A31 coverage addendum and D1–D5 delta

1 November 2026. **Proposal for explicit owner disposition; not approved policy, implemented checking, feature acceptance or harness authorization.** Prepared by actual muse-wonder-1.0 during the requested definition review. Read together with the unchanged [launch evidence proposal](WP10-LAUNCH-EVIDENCE-CONTRACT.md). If the owner adopts this addendum, its explicit deltas below control over conflicting scope shorthand in that proposal. No existing acceptance meaning changes.

Source checkpoint: `7344563bf6772d5b20c280c941a1d8f16f252dc9`. Board snapshot: save 231, 31 October 2026 20:07:02 UTC; checks A01–A31. The original proposal SHA-256 is `b04680df4532d5d00e111fa8e3dcc0ebda9524059a27833dcc88038b83b2268d`. The unchanged release-checker SHA-256 is `7bf2adc36ea69db362ab4ccbc9877b0db771f3cfb071a1080bcc095c7cfddf64`.

## 1. Small scope correction

Extend the original proposal's no-orphan rule and missing-row negative fixture from **A01–A27 to A01–A31**. Keep exactly one coverage row per control, with as many separately identified evidence records as needed. A missing/duplicate control, missing required feeding-task reference, or unsupported substitution is not covered. This is a proposed evidence register, not a claim that the existing checker loops these IDs.

Current checker behavior is unchanged: mandatory task status/evidence/blocker/finding/ancestry checks and explicit A01–A14, or A01–A13 in manual-only mode. The manual-only exception is only MOT-95/live-Muse; keep an A14 register row recording that precise exception and its owner authority instead of deleting the ID or pretending live-Muse passed. No voting, room, external-Muse, manual-flow or device obligation is excused by hosted-Muse optionality.

## 2. Four additional evidence rows

| ID / fixed board meaning | Proposed repeatable positive proof and identity | Proposed negative control / honest pending state |
|---|---|---|
| **A28:** Canonical content/media identities and per-view eligibility agree with actual visible state after edit, replacement, Undo, reload, reconnect and native restore; private projections remain isolated. | MOT-133's approved eligibility/replacement policy, source/fixture snapshot and independently specified expected per-view inventories; object/asset/presentation IDs, media versions, scope and exclusion reasons. Compare actual visible images/text/captions with expected inventory through edit/replacement, Undo/Redo, view changes, cold reload and native restore; include acknowledged room reconnect under the approved room contract. Preserve originals, provenance and private owner-backup versus shared/Muse/HTML projections. | Inject a stale replacement image or orphaned caption, silently omit an eligible identity, or expose a private derivative/thumbnail/metadata canary in a public projection; the relevant probe must detect it. Missing historical source inventory stays unknown, not an inferred historical loss/pass. A fresh bound equivalent fixture can prove current behavior. Room reconnect remains pending until implemented and tested; local proof alone does not pass the complete control. |
| **A29:** Authored postcard captions persist in scope and actual board save, room sync, artifact bytes and kept-export retention have distinct truthful states and recoverable failures. | MOT-134's approved caption scope and schema; fixture's exact authored/cleared values and selected-media identities. Edit, blur/wait, navigate, Undo/Redo, reload and native restore; inspect actual preview and produced bytes. Independently record board persistence receipt, applicable room acknowledgement/conflict, available artifact bytes and retained-export receipt. Inject latest-save, quota/private-storage and keep failures and exercise the promised retry/download/package recovery without losing editable work or existing bytes. | A generated default overwrites acknowledged authored text; a stale save completion reports success; failed keep reports retained; room-pending reports synced; an unrelated board is changed. Each must be detected. Kept-export failure is not automatically board-data loss. Room evidence and missing source observations stay explicitly pending. |
| **A30:** Source-bound selection manifests, safe rich text and coherent editorial hierarchy preserve the actual trip in preview, standalone HTML and restored native packages without silent caps or truncation; PDF remains closed. | MOT-135/MOT-119 evidence on the same candidate: four-day brief, more than eight candidate places/five sections, long prose/full venue labels, supported safe Markdown, mixed photos/art and private canaries. Freeze eligible/selected/excluded/unresolved identities, reasons, order, representations, source revision and media versions. Compare every intended section/media/credit and complete text or labelled continuation against actual preview, moved fresh-context offline HTML and cold restored native package. Preserve F136-v1.1's approved trip framing/personal/day-plan hierarchy and intentional apparel. Bind manifest and actual artifact hashes/bytes, not screenshots alone. | Omit an eligible selected image, change its version, introduce an unannounced cap or unlabeled clipping/raw supported syntax, move brief behind a generic source article contrary to approved priority, or include a private canary. Detect the mismatch against the independent expected inventory. Unknown historical denominators remain unknown; an implementation-generated manifest alone is not an oracle. No PDF generation or retest. |
| **A31:** The AI-assisted Foundation Sprint/PRD has actual owner and requested reviewer disposition and a falsifiable validation contract, with production scope and existing method/trust/geometry/harness decisions preserved. | MOT-136's owner decision receipts, actual Muse Wonder disposition and exact F136-v1.1 decision/protocol identity, including closed AS136-01, paired combined-effort/A-retention rules and explicit MOT-129 execution handoff. Distinguish direct reports, historical artifacts, external claims, AI critique and untested hypotheses. Record that the contract is approved while T1–T5 product observations remain pending. Existing disposition at `111bd0c691f5c1ce09ccc9f3b4cd7c975468e842`, reviewed protocol `5a85aff87ce95c3f53f4d34ed49364676ff1e079`, is usable evidence subject to exact-document binding. | Substitute unapproved F136-v1, omit owner/reviewer disposition, alter effort/retention rules after observations, call prototypes/customer opinions actual study results, or treat Foundation approval as method/trust/geometry/harness approval. A31 must reject those claims. **A31 does not require the study to have run.** Actual T1–T5 execution, paired comparison and resulting owner disposition belong to MOT-129's existing acceptance/A27; their absence continues to block that launch journey, not the already approved A31 decision contract. |

## 3. Feeding-task reconciliation, without new dependencies

This is the board's current `checks` membership, not a new list of approved tasks. Freeze it with the board snapshot; flag additions/removals for explicit reconciliation. The final launch also retains MOT-129's acceptance clauses covering A28–A31-related journeys even though its `checks` array presently names A21–A27.

| Control | Current feeding tasks |
|---|---|
| A01 | 69, 70 |
| A02 | 76, 77 |
| A03 | 74, 78, 80, 82, 104 |
| A04 | 83, 84, 86, 88, 103, 104 |
| A05 / A06 | 75, 85, 104 (each) |
| A07 | 73, 98, 104 |
| A08 | 90, 91, 99, 104 |
| A09 | 92, 99 |
| A10 | 79, 80, 81 |
| A11 | 71, 99 |
| A12 | 89 |
| A13 | 72, 94, 104 |
| A14 | 95 |
| A15 | 87, 91, 96, 99, 101 |
| A16 | 105, 107, 112, 117 |
| A17 | 106, 108, 112, 117 |
| A18 | 110, 111, 112, 117 |
| A19 | 113, 114, 117 |
| A20 | 109, 114, 115, 116, 117 |
| A21 | 119, 129 |
| A22 | 120, 122, 126, 129, 131 |
| A23 | 121, 122, 129, 137 |
| A24 | 123, 124, 126, 129 |
| A25 | 125, 126, 129, 130 |
| A26 | 127, 129 |
| A27 | 128, 129, 132 |
| A28 / A29 / A30 / A31 | 133 / 134 / 135 / 136, respectively |

Numbers denote MOT task IDs. A row's coordinator does not replace all its feeding evidence. Decision cards contribute their approved contract only: for example 131 cannot prove runtime A22, 132 cannot prove A27 journeys, and 136 proves A31's decision requirement rather than the study. MOT-101 supplies its A15 deployment/rollback evidence and remains the sole release gate; do not invent a dependency requiring the gate already complete before it can assess itself. Preserve its existing handling unchanged.

## 4. Minimal evidence-shape and interpretation clarifications

Retain the original `mot.launch-evidence/1` proposal with these explicit D2 deltas:

- Add `feedingTaskIds` (complete array from the frozen mapping) alongside `taskId` (coordinator). A single task ID is insufficient evidence that all feeding responsibilities are represented.
- Use `status: pass | fail | pending | scoped-exception`. A scoped exception identifies the exact excused slice and recorded owner authority; it is not a passing observation. Only the existing manual-only exception is supplied here. Unknown/unperformed evidence is pending, never silently not-applicable.
- Extend each `evidenceRefs` entry from `{path, sha256}` to also name the evidence's own `environment` and `reviewer`. Use actual values, not the example's literal pipe-separated alternatives. `environment.kind` is `actual-device`, `external`, `author` or `mock`, with device/browser/network/endpoint details as applicable; reviewer `kind` is independently `independent` or `author`. Independent review is a reviewer relationship, not a substitute for the run's actual environment. A mixed evidence row retains each record's attribution; an independent read of emulator results does not turn them into physical-device proof.
- Keep the seven original applicable/not-applicable binding categories. Referenced evidence must carry fixture/expected-inventory, protocol, frozen selection/scope and artifact identities relevant to its probe; no new digest is mandatory where genuinely inapplicable. Exact source means the assessed candidate plus a recorded scope-preserving comparison for any reused older evidence, not ancestry alone. Bind source/catalog/method/rules/guide changes that affect a probe before reusing it.
- Decision references identify actual disposition records and versions, not merely a `D1` label. D1–D5 approval permits this evidence policy only; pending MOT-123/130/133/134 choices still block their affected feature proofs. This does not reopen already approved 131 or F136-v1.1 decisions.

Apply the original absent/stale/mocked/device/decision negatives to the four new rows and feeding references. Add a counterexample where A31 is correctly contract-approved but T1–T5 are empty: A31 may pass its decision requirement; MOT-129/Foundation journey acceptance may not. Preserve historical owner PDF-closure receipts under A07/A12 and associated records. The original §5 PDF negative means **reject new PDF production/testing or PDF substituted for current HTML proof**, not delete historical evidence or reopen closed PDF work.

## 5. Concrete D1–D5 owner delta

Each choice remains **pending** until the owner explicitly records approve/reject/modify against this proposal and its parent document. Muse Wonder's coherence review does not supply these answers.

| Decision | Proposed owner decision package |
|---|---|
| D1 | Ratify the parent's fixed A15–A27 evidence meanings plus this addendum's A28–A31 rows and A01–A31 feeding reconciliation. Preserve the A31 contract-versus-MOT-129 execution split and unknown historical denominators. |
| D2 | Ratify the parent's applicable binding model with §4's complete feeding IDs, explicit pending/exception states and per-record run/reviewer attribution; require inspectable actual evidence identities. |
| D3 | Ratify the parent's negative controls extended to all 31 IDs, missing feeding evidence, the four new feature negatives, and false promotion of A31 approval into study completion; preserve historical PDF closure while refusing new/substitute PDF proof. |
| D4 | Confirm MOT-101 remains the one release gate and the existing harness/checker remains unchanged. Approve only this coverage specification. Any later mechanical checker/test/lint/settings change needs its own concrete explicit owner disposition; this package neither implements nor implicitly authorizes it. Until then, the expanded coverage is an explicit evidence-review obligation and must not be described as mechanically enforced by the existing checker. |
| D5 | Confirm the only supplied exception is hosted-Muse manual-only MOT-95/live-Muse under A14. A01–A13, shared rooms/voting, supported external-Muse journeys, physical devices and all other required evidence remain in force. No hosted paid model call is required merely to satisfy an automated check. |

Once those exact decisions and the requested reviewer disposition are recorded, MOT-132 may be assessed as a **completed definition contract**. That does not pass A27, execute a journey, finish a participant study, change the progress denominator or grant launch/deployment acceptance. Missing feature decisions, actual-device/shared/external proof and applicable permissions remain visible; approval of this appendix is not sufficient to remove them.
