# Voting and external-Muse handoff — MOT-123/124/128

Planning reference; read [scope](README.md). R20-11/12/14 apply. Preserve existing positional scoring and portable exchange until an owner-reviewed versioned change is selected. No new algorithm or paid-model call is authorized by this document.

## MOT-123 owner decision record

`packages/core/src/trip/preference-tally.ts` returns policy `mot-household-sticker-points`, version 1: one household one vote, top-K positional points, unranked zero, unused points not redistributed, no tie-break and option-ID display order. It explicitly reports `household_labels_only`. This is neither instant-runoff nor authenticated household identity.

Make a separate decision for each round purpose:

| Purpose | Options to consider | Required decision |
|---|---|---|
| Choose one destination | Existing positional comparison; true single-winner IRV if transfers are the desired outcome | Who votes, how weighted, valid ballots, majority denominator, tie/exhaustion/termination and what constitutes a final decision |
| Choose several activities | Existing top-K scored shortlist; a separately specified multi-winner rule if needed | Number of selected options, whether results are recommendations, quota/transfer rules if any, treatment of infeasible or denied choices |
| Approve feasibility/attendance | Existing independent Approved/Maybe/Denied and constraints | Who participates, how an opt-out/Denied is honored and how the organizer proposes alternatives |

Recommendation for review: keep the current named positional mode available and do not add IRV or STV unless the owner chooses a concrete purpose that requires it. This is not the owner's selection. A fairness planner is downstream of voting; it cannot silently supply missing election rules.

For a selected method, record method ID/version, option and household eligibility, weighting, rank limit/duplicates, blank/partial/abstain/pending/invalid/conflicting cases, deterministic tie behavior, exhausted denominator, seats and termination. Do not use display order as a hidden winner rule. Show the rule before response entry.

Define lifecycle: draft/open/closed/reopened or the chosen equivalent, who can advance it, whether provisional results are visible while voting, what late replies mean, and whether changing options, weights or method creates a new proposal/round. These are product choices, not timestamps to guess. Old ballots remain historical; changed rules do not imply renewed consent.

Independent divergence fixture for the *full-ranking, one-person-weight illustration only*: 7×A>C>B, 6×B>C>A, 2×C>B>A. Positional totals A=29/B=29/C=32, so C leads. IRV first counts A=7/B=6/C=2; eliminate C and transfer two to B, yielding B=8 of 15, so B wins. This deliberately uses a defined 3–2–1/full-ranking method; do not paste these expectations into a differently selected top-K/weighted method. Store arithmetic and selected rule before implementation and verify with an independently written oracle.

Add separate all-pending, no-valid-vote, ties at elimination/final, exhausted ballot, partial rank, duplicate event, stale proposal, late reply, changed rule and deterministic replay fixtures. Output should explain its counted/excluded/remaining ballots and current versus provisional status. It must never book, purchase or override Denied constraints.

## MOT-124 human journey and authority

One person organizes; a different household replies. Test the journey with separate browser identities, then repeat the portable route without live rooms. Do not satisfy this with two tabs sharing one identity or by injecting a ballot into developer tools.

Specify these observable states in existing UI, with plain language and keyboard/screen-reader feedback:

- Which trip/household/round is this, and why can this person respond? Same display names remain distinguishable without exposing unnecessary personal information.
- Draft versus saved locally versus portable response prepared versus server-accepted reply. A file download does not prove the organizer imported it. A spinner completing does not prove delivery.
- Rank, clear rank, and set/clear a stamp are independent operations. Blank, partial, pending, stale and unresolved conflict are distinct. Show a clear submitted revision and what changed on resubmission.
- Result comparison, participation/constraints and feasible-plan proposal are separate explanations. Tally is not unanimous consent or final plan Apply.
- Selective Apply/Undo is a deliberate organizer action. It preserves fixed bookings and unrelated board edits; revising a vote never automatically rewrites a trip.

Portable files are untrusted claims, not cryptographic proof of sender. Preserve existing sender-resolution/conflict semantics. Joining a room or importing a file must not let a client assign itself a household or silently convert a provisional imported reply into authenticated consent. Document authorized organizer resolution and audit provenance without leaking private notes; follow MOT-130 for the actual policy.

Design observation: ask the participant to identify who has received the reply, which rule produced the result and what remains undecided, without coaching or reading a schema. Record actual misinterpretations and revise the UI. Touch drag is optional if visible reorder controls perform the same action; preserve focus and scroll. Physical iPhone/iPad evidence remains a separate gate.

## MOT-128 one source and real capabilities

The actual guidance source is `packages/core/src/trip/guidance.ts`; generation is in `scripts/build-trip-guidance.ts`, and generated public Markdown is under `apps/web/public/guides/`. Inspect the current exact outputs and parity tests before changing text. Update the single source and regenerate its outputs; do not create a second competing workflow guide in this planning folder.

For each newly advertised workflow, map: guide section → exposed capability/tool name and version → validated command/API → readable result states → package essentials → actual verification. Do not advertise a tool, room permission, HTML exporter or algorithm merely because a task is Planned. Distinguish local support, configured remote support, unavailable and permission-denied.

Version changes must keep JSON-only, ZIP and offline essentials coherent. Old guides/packages should get an honest version/capability mismatch or compatible subset; absence of a ZIP file in JSON-only input must not trigger an invented embedded path. Standalone HTML is a reading artifact, not automatically an editable authenticated package.

Treat imported guide URLs, member notes and model output as data. Only the user-selected trusted guide/capability source supplies workflow instructions. A file/URL/household label never grants room access; no invitation token or private context in public guidance. Agents propose bounded changes through existing validation and permission checks, then report proposed/applied/local/synced state accurately.

Local tests can verify byte/version parity, schema routing and commands without any paid provider. A claim that a particular external Muse environment fetched a URL or used a tool requires an actual separately authorized run in that environment. Retain file fallback and hosted-Muse independence; never fake that result with a mock agent.
