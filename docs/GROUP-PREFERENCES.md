# MOT-105 group round and household response contract

The optional `meta.groupPreferences` contract is version 1 inside the existing trip document version 2. Trips without it remain valid and are not rewritten. Existing v1 trip migration still produces a preserved copy; unsupported future trip or group versions fail on load. This task defines and persists rounds and validates responses. Voting UI, response merging/history and tallying remain MOT-106, MOT-107 and MOT-108; the WP9 stand-ins are unchanged.

A person declares the roster and rounds with `session.execute(person, 'trip_group_configure', configuration)` and reads them with `trip_group_read`. Both commands are human-only and cannot be proposed by agents. Configuration uses the existing schema/transaction/revision/Undo path. An agent may not create a new voter. Public trip reads and metadata-command results omit this roster. Existing cards and itinerary are untouched.

Configuration fields:

- `version: 1`, stable `trip_id`, `households: [{household_id, display_name}]`, and `rounds`.
- Each round declares `round_id`, positive `proposal_version`, `kind` (`destination` or `city_venue`), `option_ids`, `rank_limit` (3 or 5), and `household_weighting: one_household_one_vote` before responses. A city venue round also requires `city_id`; a destination round forbids it.
- Each proposal has at most one destination round for the trip; city venue rounds have distinct round IDs. IDs are stable labels, never display names or filesystem paths. Renaming a household keeps its ID. Duplicate voter IDs are rejected. Declared round policy/options cannot change silently; retain old definitions and add a new proposal version.

Call `await createGroupResponse(body)` to produce a canonical SHA-256 `response_id`. The body contains `version: 1`, `trip_id`, `proposal_version`, `round_id`, `household_id`, positive integer `response_revision`, `rankings: [{option_id, rank}]`, independent `stamps: [{option_id, value}]` (approved/maybe/denied), explicit `shared_note`, `constraints`, and informational ISO `responded_at`. Ranks are contiguous and unique up to the round's K; a partial or empty shortlist is allowed. Rank and stamp never imply payment, booking or permission to disclose other material.

Each shared constraint contains `id`, `status` (confirmed/inferred/unknown), `text`, `source`, `source_date` (calendar date or explicit null), and `sharing: shared`. Unknown/private/contact/chat fields are rejected rather than copied. Shared note text, including markup, is inert data. None is executed or automatically fetched. Schema bounds limit households, rounds, options and text.

`await validateGroupResponse(response, configuration, senderHouseholdId?)` checks its hash, declared trip/proposal/round/options, household membership and K. It returns the normalized response plus `identity: label_only`, `sender_context` and `requires_resolution`. Omit a known sender context (or supply a different household label) and the result flags unfamiliar context for resolution. Even a matching label is not authentication: hashes are content identities, not signatures. A future import/ledger consumer must retain and resolve these flags; this validator does not accept a ballot into a ledger or count a vote. Revisions, not timestamps, are the intended ordering source for MOT-107.

Canonical hashing orders ranks by rank, stamps by option ID and constraints by ID; display names are absent from responses. The same semantic array order produces the same ID. Changed content with an old hash is rejected. A higher revision with an earlier timestamp still validates; no clock-based winner is chosen here.

Native persistence keeps the optional data. A personal/private ZIP explicitly includes it and preserves stable `trip_id` when reopened into a fresh board ID. Guide, stay and selected shared ZIPs omit it from both readable metadata and the encoded document. Generic guest copies do not acquire the organizer roster. Household response distribution is explicit, not a side effect of sharing a trip.

Validation: `packages/core/src/trip/group-preferences.test.ts`; 12 regressions cover declarations, immutable policies, caller-result isolation, Undo/Redo, private fields, invalid/future input, response identity and scope, clock independence, private/shared package reopening and legacy migration. The existing tests, deadlines and harness are unchanged. Builder evidence is recorded on the production integration kanban; independent review remains assigned to Muse Wonder. No PDF work or live provider calls are part of this task.
