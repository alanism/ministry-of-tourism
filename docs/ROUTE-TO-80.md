# Local route to 80% — 1 November 2026

Status: execution plan and evidence reconciliation, not approval of pending product decisions.
Input: production kanban save 230 and canonical release candidate
`7344563bf6772d5b20c280c941a1d8f16f252dc9`. MOT-120 is owned by another
worker and is excluded. No push, deployment, provider call, PDF work or
existing harness change is part of this route.

## Arithmetic and definition

There are 68 required cards and one optional card. Required status weights
sum to 5,050: **74.2647%**. A true 80% needs at least 5,440; because
status changes occur in increments of 25, the next reachable sum is
5,450 (**80.1471%**). The requirement is therefore **400 additional
weighted points**, without changing weights, required scope, denominator,
acceptance criteria or holds. A rounded display of 80% is not the target.

This is task-status progress, not release readiness or an estimate of
engineering effort. Large and small tasks currently have identical weight.

## Execute existing earned progress first

Actual Muse Wonder's read-only audit is retained beside the board at
`Design Sprints/Route-To-80-2026-11-01/WONDER-STATUS-AUDIT.md`.

| Card | Existing → supported status | Weight gain | Evidence and remaining boundary |
| --- | --- | ---: | --- |
| MOT-131 | In progress → Complete | 75 | Alan approved G1–G6; Muse Wonder approved the exact contract, including recovery. Complete means the contract only. No runtime, A22, device or production acceptance. |
| MOT-119 | In progress → Integrated | 50 | HTML export and dense-trip changes integrated at e26ec87/61e4a07. Offline, native-package, cancellation and memory evidence retained. Physical Safari and device-memory suitability remain pending; observed private-process peak was about 1,597.4 MiB. |
| MOT-100 | Implemented → Integrated | 25 | WP6 engineering at 0355bb6 is incorporated. Existing 4s/2s budgets and past failures retained. Physical iOS/Safari acceptance remains pending; no fresh performance benchmark is claimed. |

After fresh unchanged checks pass and these records are reconciled:
**5,200 / 68 = 76.4706%**. No other card changes are justified by that audit.

## Smallest identified remaining implementation route

Prefer resolving existing, drafted contracts over starting live rooms or
the dependent full-catalog/shared-journey work. This is a dependency/effort
assessment, not a measured promise of elapsed time.

| Next card | Required work | Potential gain from current status |
| --- | --- | ---: |
| MOT-132 | Reconcile A28–A31 into the existing launch-evidence proposal; obtain explicit D1–D5 owner disposition and actual Muse Wonder review. Complete the evidence contract only; leave the mechanical harness unchanged. | 75 |
| MOT-130 | Turn T1–T10 into concrete owner choices, including numeric limits, recovery and invite policy; obtain actual Muse Wonder approval of the source-bound trust contract. No room backend is required to complete this decision card. | 100 |
| MOT-123 | Owner selects V1–V3 and lifecycle; Muse Wonder reviews the definition; implement the declared method/version/lifecycle and prove it against independently calculated fixtures in the real app. Drafting or approval alone is not completion. | 100 |

If all three reach Complete after their own checks, the project reaches
**5,475 / 68 = 80.5147%**. They are not approved or completed by this plan.
The first two add 75 + 100 = 175, leaving **75** for MOT-123 to reach
Integrated. That gives
**5,450 / 68 = 80.1471%** while retaining any genuine full-acceptance holds.

MOT-123 must not be stopped at an artificial stage just to hit the number:
finish its authorized scope and record the highest supported status.

## Concrete next owner fork: voting

The least new algorithm work is to retain the existing
`mot-household-sticker-points@1`, with its existing one-household weighting,
K=3 or K=5 scale, zero for unranked options, and no redistribution.

**Alan approved the following exact voting/lifecycle package on 1 November
2026 and requested Muse Wonder review before implementation.** Muse Wonder disposition
is pending. This approval does not settle MOT-130 or MOT-132.

- V1: destination comparisons use positional points. Highest points is
  an advisory leader, not an automatically selected or booked destination.
  Ties remain explicit; display order is not a tiebreak. No IRV/approval/STV.
- V2: activity rankings produce an advisory shortlist, with no automatic
  seat count or itinerary insertion. Explicit human planning remains separate.
- V3: Approved/Maybe/Denied remain independent; no score overrides Denied,
  and no silent substitution or presumed consent follows a missing response.
- Lifecycle: organizer explicitly opens/closes rounds; running results are
  provisional with pending/conflict counts. Closed results freeze counted
  responses. Late returns are retained as uncounted, not silently applied.
  Reopening or changing options/K/weight/method creates a new round/proposal
  version; old ballots remain historical and require a new explicit response.
  Closing records a final tally, not unanimous agreement or a purchase.
- Membership/remote authority remains MOT-130's responsibility. A portable
  sender label never grants household authority; existing explicit resolution
  and revision/conflict rules remain.

Source: the already delivered voting options and corrected fourteen fixtures
in `Design Sprints/Muse Wonder-Wonder-Design-2026-10-31/`. These proposals must be
checked against the exact current schema and reviewed by Muse Wonder before implementation.

## Why execution cannot silently bypass the remaining decisions

MOT-132 explicitly requires owner approve/reject/modify decisions D1–D5.
MOT-123's owner decision is now recorded above; requested Muse Wonder review remains
pending before implementation. MOT-130 explicitly requires approved authority/recovery/limits;
its draft has no numeric limit or fully selected recovery/invite policy.
The instruction to seek 80% does not supply those missing choices.

Do not count a prototype, a proposed rule, a review start, or an unresolved
source mapping as accepted implementation. MOT-121's source gaps and its
newly found apparel-denominator mismatch are not exclusions we may invent.
Keep physical devices, real external-Muse/shared-client journeys, production
smoke/rollback and the single MOT-101 release gate intact.
