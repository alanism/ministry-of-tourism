# MOT-123 contract disposition — 1 November 2026

**Alan approved the positional method/lifecycle package and then explicitly
approved option A: sealed closure with an explicit new round.** Actual Astra
approved the selected method and implementation invariants, conditional on
that one remaining choice. AS123-01 is resolved at the decision level.

Owner answers:

1. “Approve this contract, then obtain Astra review” — the exact V1–V3 and
   lifecycle package recorded in ROUTE-TO-80.md.
2. “Approve sealed closure and explicit new round” — a durable readable
   sealed result which ordinary Undo cannot erase/reopen; other edits retain
   Undo; revision requires a new round and fresh responses.

The normative implementation contract is
`MOT123-VOTING-LIFECYCLE-CONTRACT.md`, with its section 5 option A now
selected. Its pending wording is retained as the state before this answer.
No extra “Undo closing” feature is selected. Existing Undo history must not
be cleared. Clock/seal version, private-package, orphan/reused identity,
async freshness and downstream-consumer requirements all remain binding.

Actual Astra review is retained at
`Design Sprints/Route-To-80-2026-11-01/ASTRA-MOT123-CONTRACT-REVIEW.md`
beside the board. This disposition approves implementation of the specified
contract, not a feature pass. Legacy rounds, existing arithmetic/harness,
separate stamps, pending/conflict states, private projection and all
production/device/shared-room holds are preserved. No automatic winner,
booking, IRV/STV, remote identity or extra household authority is introduced.

Implementation must first reproduce missing behavior with new focused tests,
then pass the unchanged full harness and actual rendered workflows. Record
implementation review separately before local integration. MOT-120 belongs
to another worker and is outside this slice.
