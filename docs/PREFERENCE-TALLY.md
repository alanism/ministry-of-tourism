# MOT-108 deterministic household tally

`await tallyGroupPreferences(configuration, ledger, {proposal_version, round_id})` validates MOT-105's declaration and every MOT-107 ledger entry/hash before reading accepted current responses. It never writes a board or ledger. Undefined ledger input means no responses. Unknown rounds and stale proposal versions are refused; request a declared round in the current proposal. Each result covers one scale, never a combined total across K3/K5 rounds.

Policy `mot-household-sticker-points`, version 1: rank r earns `K + 1 - r`, one household is one voter, unranked options earn zero, and unused points are not redistributed. K5 gives 5/4/3/2/1; K3 gives 3/2/1. Every declared option is included, including zero-point options. Options and households are displayed by stable ID. Equal totals remain equal: ID ordering does not choose a winner.

`options` contains numeric points plus independent household-label arrays for Approved, Maybe and Denied. Stamps neither add nor subtract rank points, and imply no booking/payment/disclosure. Explicit shared notes and dated confirmed/inferred/unknown constraints are separate inert data. They are never executed, fetched or turned into verified facts. Feasibility and participation enforcement remain MOT-110/111.

`households` reports pending, partial, complete, conflict or needs_resolution, with ranked count and contributed points. An accepted empty response is partial and contributes zero; an absent response remains pending. `coverage.responding` counts accepted current responses only. Partial plus complete equals responding; pending, conflicting and needs_resolution cover the rest. `unresolved_households` separately flags unresolved newer deliveries even when an earlier resolved response still contributes. MOT-107's highest resolved revision determines the accepted snapshot; conflicts at that revision contribute no points. Informational timestamps never order responses.

Tools over explicitly supplied data:

```js
const input = {configuration, ledger, round: {proposal_version: 1, round_id: 'venues'}};
const tally = await window.motTrip.tallyPreferences(input);
// Same read-only command, available through capabilities and normal tool calls:
const same = await window.motTrip.call('trip_preference_tally', input);
```

The tool never reads `meta.groupPreferences`, local ballot drafts, private cards or saved response files from the current board. Household labels and resolution flags are not authentication. A caller must supply the explicitly shared configuration and ledger. File parsing/collection remains MOT-107; the local ballot UI remains MOT-106; organizer summary/proposal UI remains MOT-112. No implicit submission, tally cache, provider call or itinerary change is added here.

Validation uses real MOT-105 envelopes and MOT-107 ledgers, not WP9 stand-ins: 20 options/four households produce 60 points (Beach14, Market13, Boat9, Garden7, Museum6, Cooking6, Aquarium4, Hike1, other12=0), full household15 and two-choice9. Regressions cover independent stamps/concerns, empty/pending coverage, repeated JSON/ZIP, higher/lower/conflicting/unresolved replies, K3 and round isolation, stale proposals, hashes, stable permutations and ties. A deliberate off-by-one weighting mutation fails the new suite; original feature bytes are restored. The installed browser tool and pure Node/CLI path produce identical results with no canonical board changes. Builder evidence is in `Design Sprints/Build-MOT-108-2026-10-30` in the planning workspace. Existing tests, limits and harness are unchanged; independent review is deferred. No PDF work or deployment.
