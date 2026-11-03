# WP10 Launch Evidence Contract — MOT-132 Proposal

Status: **proposal for owner review only**. Not approved policy, not an
implemented checker, not evidence any control passed, and not a change to
any harness or checker. The owner decides the evidence shape and any delta;
this proposal does not rename or repurpose any existing product requirement.

## 1. Current behaviour (stated accurately)

- `scripts/check-mot-release.cjs` is the one existing MOT-101 release gate
  and stays immutable; this proposal cannot and does not modify it or the harness.
- The current checker validates every mandatory task's evidence, status,
  blockers, findings and ancestry, but explicitly loops only A01–A14.
- Manual-only mode excuses only MOT-95 / live-Muse evidence under A14.
  It still enforces A01–A13 in full. A01–A13 are enforced product controls,
  not "manual-only controls", and no reading of manual-only mode creates a
  prohibition on Muse calls — it simply never requires hosted paid Muse
  calls as automated evidence (see A27).
- A15–A27 already have the fixed product meanings in §3. They are not yet
  looped by the checker. Nothing here is in force until the owner approves
  it and a separate implementation task lands it.
- Historical PDF closure is preserved: the PDF control is retired (A21);
  no new PDF work is required, produced or accepted anywhere below.

## 2. Principles

1. **No orphans:** every ID A01–A27 maps to exactly one evidence row;
   a missing row fails. Acceptance IDs keep their fixed meanings (§3).
2. **Applicable bindings only:** each record binds current source, catalog,
   guide, method, schema, rules and artifact versions/digests *where
   applicable*, and gives an explicit not-applicable reason for each that
   is not — never every digest for every task, never a silent omission.
3. **Evidence-kind honesty:** actual-device, independent-review and
   external-environment evidence are distinct from author evidence and
   from mocks/stubs; mocks may support but never solely satisfy a device,
   independent or external control.
4. **Prerequisites:** a control passes only when its approved decision
   prerequisites (§6) are recorded approved; pending decisions block.
5. **Muse optionality waives nothing else:** shared rooms (A25), voting
   (A24) and every other control must be satisfiable without Muse;
   Muse's absence never waives them.

## 3. Fixed acceptance meanings → proposed evidence and negative controls

| ID | Fixed meaning | Evidence required (proposed) | Negative control |
|----|---------------|------------------------------|------------------|
| A15 | Old board/ZIP versions migrate in a preserved copy; future versions fail safely; deploy serves the MoT site with FCC unchanged; smoke tests and rollback documented | Migration fixture run (old + future versions), deploy/config digest, smoke + rollback records | future version migrates silently; FCC tree digest changed |
| A16 | Versioned household/round responses validate and merge idempotently; latest valid revisions replace, duplicates/stale/conflicts never double-count; private data/canonical itinerary protected | Schema validation + merge-run records on bound schema/rules digests | duplicate/stale revision double-counts; private field leaks |
| A17 | Numbered rank stickers use the declared K scale; deterministic tallies retain independent stamps and pending/partial household coverage; four-household example totals 60 points | Deterministic tally record reproducing the 60-point example | tally differs on re-run; pending household shown complete |
| A18 | Planning respects confirmed constraints and unknowns, then compares top-two coverage, first-choice coverage, participating points and practicality; denied/unable households gain no false participation credit | Planning evaluation record on bound rules digest | denied household credited; unknown treated as confirmed |
| A19 | Booking deadlines stay separate from activity dates; during-trip local adjustments preserve fixed bookings and participant feasibility without unauthorized purchases/cancellation | Date-model + adjustment-run records | deadline merged into activity date; fixed booking altered |
| A20 | Optional relevant workflows and one versioned guide work across below-board HTML, supported tools and JSON/ZIP; small edits skip planning; HTML keepsakes preserve media/privacy with truthful save and recovery | Guide-version-bound workflow records across HTML/tools/JSON/ZIP | small edit triggers planning; keepsake drops media or misreports save |
| A21 | Export delivers an actual private-safe standalone magazine HTML file with permitted embedded assets/fonts, offline file-open and honest failure; PDF control retired; JSON/ZIP remains | Actual exported HTML artifact (digest), opened offline from file; failure-case record. No PDF evidence | export requires network; private asset embedded; PDF supplied |
| A22 | People freely place, move, resize, duplicate and paste holiday-board objects with touch/keyboard alternatives, Undo/Redo and durable shared TripSession behaviour | Human UX record (touch + keyboard) on an actual device plus TripSession persistence record | keyboard-only path missing; undo loses objects |
| A23 | Full eligible FCC city/art/sticker/image inventory is reconciled by identity and actually discoverable/insertable, preserving origin/credit/rights and measured loading behaviour | MOT-121 audit report (identity reconciliation) plus in-product discover/insert check and loading measurement | audit gap labelled covered; credit/rights dropped |
| A24 | Households complete a usable voting round under an explicitly declared positional or true ranked-choice rule; ranks/stamps, revisions, conflicts, fairness and privacy stay distinct and correct | Declared-rule voting-round record with revision/conflict fixtures | undeclared rule applied; revision silently overwrites stamp |
| A25 | Firebase shared rooms give low-login invitations, server-enforced permissions/revocation, real concurrent edits/votes and honest offline conflict/sync recovery, free for now with explicit limits | External-environment Firebase run: concurrent clients, revocation and offline-recovery records, stated limits | client-only permission check passes; offline conflict silently resolved |
| A26 | Magazine/ad and board expose every supported FCC apparel city/line/design for preview and verified existing shop handoff without invented checkout, inventory or private trip leakage | Apparel inventory reconciliation + shop-handoff verification record | invented checkout/inventory shown; trip data leaks to shop |
| A27 | Expanded launch journeys and one versioned public/external-Muse guidance contract pass actual HTML/JSON/ZIP, shared-client, human UX and physical-device checks without requiring hosted paid Muse calls | Journey records on physical device + shared client + human UX sign-off; guidance-contract version digest | journey passes only in a mock; hosted paid Muse call required |

A01–A13 keep their current meanings and enforcement unchanged, and A14
keeps only its manual-only MOT-95/live-Muse excuse. No ID above is
renamed, merged or given a new product meaning by this proposal.

## 4. Concrete evidence JSON shape (proposed)

```json
{
  "schema": "mot.launch-evidence/1",
  "controlId": "A21",
  "taskId": "MOT-000",
  "status": "pass",
  "bindings": [
    { "type": "source", "version": "…", "sha256": "…", "applicable": true },
    { "type": "guide", "applicable": false, "notApplicableReason": "export control; no guide surface" }
  ],
  "environment": { "kind": "actual-device | independent-review | external | author | mock",
                   "detail": "device/env/reviewer identity" },
  "reviewer": { "kind": "independent | author", "id": "…" },
  "decisionRefs": ["MOT-132#D1"],
  "findings": [], "blockers": [],
  "negativeControls": [{ "id": "NC-A21-1", "expected": "fail", "observed": "fail", "fixtureDigest": "sha256:…" }],
  "evidenceRefs": [{ "path": "…", "sha256": "…" }]
}
```

Binding types: source, catalog, guide, method, schema, rules, artifact.
Each is either bound with version + sha256 or carries an explicit
not-applicable reason; a missing entry is a failure.

## 5. Negative fixtures (each must be observed failing)

- Missing evidence record for any ID A01–A27 (orphan control).
- Any applicable binding digest/version not matching current release inputs,
  or a binding omitted without a not-applicable reason.
- `environment.kind: "mock"` submitted for A22/A27 device or human-UX
  evidence, A25 external evidence, or as sole evidence for any control
  requiring an actual device, independent review or external environment.
- Reviewer identical to the author where independent review is required.
- Negative-control entry absent, or `observed` ≠ `expected`.
- A PDF supplied as evidence for any control (retired in A21; no new PDF work).
- Any control (notably A24/A25) waived because Muse is optional or
  unavailable, or an A14 excuse extended beyond MOT-95/live-Muse.
- Control marked pass while a §6 decision prerequisite is unapproved.
- An A23 row citing the MOT-121 audit with gaps as completed coverage.

## 6. Owner decision section (approval prerequisites)

The owner must explicitly record **approve / reject / modify** for each:

- D1: Ratify the §3 evidence requirements per fixed A15–A27 meaning
  (meanings themselves are not open to renaming by this proposal).
- D2: Ratify the evidence JSON schema `mot.launch-evidence/1` in §4,
  including applicable/not-applicable bindings — the evidence shape and
  any delta to it are the owner's decision.
- D3: Ratify the negative-fixture list in §5 as mandatory.
- D4: Confirm the current checker stays immutable and remains the one
  MOT-101 release gate; implementation, if approved, is a separate task
  and no harness change is proposed here.
- D5: Confirm manual-only mode excuses only MOT-95/live-Muse under A14,
  still enforces A01–A13, and waives no shared-room or voting control.

Until D1–D5 are approved, this contract has no force, no checker may be
changed on its basis, and no launch claim may cite it.
