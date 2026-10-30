# Shared-room implementation contract — MOT-125/126/130

Status: proposal and adversarial reference, **not an approved backend design**. Read [review scope](README.md). R20-1–4 and R20-12 apply. Finish MOT-130 before changing schema or connecting persistent shared state.

## Existing boundaries to preserve

- `packages/core/src/trip/model.ts:20` puts trip metadata, cards, assets, presentations, revisions and applied IDs in one Y.Doc. Group workspace/ballots also live in metadata.
- `persist.ts:6` encodes the entire document. `package.ts:65` already explains why a shared export constructs a fresh filtered document. A card scope filter at render time does not change the original encoded document.
- `session.ts:73` validates commands and limits local agent actions. Its Actor argument is local input, not authenticated Firebase identity. A network peer must not bypass this boundary by uploading arbitrary Yjs bytes.
- `revisions.ts:42` increments a numeric revision from local state after commands. Remote Y.applyUpdate does not itself perform that command path. Two offline clients can independently generate the same number for different content; that number alone is not a distributed concurrency token.
- `session.ts:104` tracks per-actor Undo origins. Reusing the current local human actor label for every remote user would destroy the intended isolation.
- `trip-store.ts:53` uses local board identity and IndexedDB. Account/room changes need explicit storage/subscription isolation; matching a board ID does not prove a live member session.
- This checkpoint's `firebase.json` is Hosting configuration, and the web package has no Firebase client dependency. Hosting acceptance is not evidence that Auth, room rules or Storage rules already exist.

## MOT-130 deliverable: choose an enforceable boundary

Compare these meaningful alternatives before selecting the smallest viable one:

| Alternative | Strength | Cost / rejection condition |
|---|---|---|
| Typed authorized commands submitted to a trusted room service; server executes validated shared transitions | Can bind authenticated UID, room role, household and schema validation in one path | Requires a trusted service, idempotency and bounded operation history; show emulator implementation/operational ownership |
| Typed per-entity room records with database rules/transactions enforcing a bounded schema | May use the selected Firebase database directly with fewer server functions | Must prove invariants, cross-record atomicity, schema evolution and permission checks are expressible/enforceable; do not assume arbitrary binary payloads are validated |
| Raw Yjs updates behind room-level membership | Natural transport convergence | **Insufficient on its own** for household-specific permissions, hidden/private state or semantic command restrictions; reject unless a trusted validator and separated data model prove the required invariants |

Choose the Firebase database/auth/storage design using current official documentation at implementation time. No product/library choice is inferred from the fact that Hosting is already configured. Keep the adapter around existing trip commands/projections; do not fork a competing board engine.

Write the selected data-flow diagram and authority matrix before code. At minimum distinguish: owner, editor, viewer, household respondent, unauthenticated visitor, revoked member and external agent. Specify which roles can invite/revoke, assign a household, propose/revise/close a round, see replies, edit ordinary cards, export and delete. A display name or claimed household_id never grants permission. Owner approval is needed for the actual role/delegation policy.

## Required contracts

1. **Private state:** Fresh allowlisted shared records/document. Explicit rules for metadata, group workspace, original source text, presentation references and media. No raw local Y.Doc, deleted/private history, auth tokens or private ledger upload. Moving a formerly shared item to private stops future sharing but cannot recall old copies; make that visible. Verify all serialized maps, logs and bytes, not just UI.
2. **Membership:** Authenticated identity is derived at the trusted boundary. Room membership and household assignment are independently validated on every accepted write/read. Document multiple devices per household, delegation, owner loss/recovery and who can resolve a disputed portable reply. Do not treat anonymous browser identity as a recoverable person without a defined recovery mechanism.
3. **Invites:** Define intended audience, permission, use count, redemption, expiry policy, revocation and race behavior. Raw invite secrets must not enter public guide/package metadata, logs, analytics, shop referrers or unrelated links. Simultaneous redeem, reused token, guessed room, role escalation and owner demotion must fail according to the chosen contract.
4. **Media:** Room authorization covers media reads/writes as well as metadata. A content hash is identity, not permission. Do not expose a cross-room existence oracle or reusable unauthenticated bearer URL that contradicts revocation. Bound decoded size, bytes and allowed types. Stage uploads until referenced by an accepted operation; reject/clean up uncommitted uploads under a declared policy without deleting referenced bytes. Test an upload completing after revocation.
5. **Acknowledgement:** Distinguish in-memory, committed locally, pending server, accepted by server and rejected/conflicted. Presence/cursor movement is not saved work. Persist enough bounded idempotency state for a lost acknowledgement/retry to produce one effect.
6. **Concurrency:** Specify conflicts for each operation: move, resize, edit text, replace media, delete, change scope, household response and round change. State which commute, which reject against a base version, and which retain visible alternatives. Yjs convergence does not by itself prove product-intent conflict handling.
7. **Undo:** A local gesture has one effect and one undo unit. Remote notes/edits survive another person's Undo. Deleted/replaced entities, reconnect and rejected writes have an explicit recovery behavior. Do not promise a cross-device persistent Undo stack unless separately designed and tested.
8. **Versions:** Pin schema/capability version and a valid remote concurrency token; prevent old clients from overwriting new fields. Back up/migrate local copies safely. Reject or open read-only on unsupported versions with recovery; never pretend convergence.
9. **Lifecycle and limits:** Owner chooses documented member/room/upload/storage/operation bounds and retention/closure behavior. Estimate fan-out, read/write and media cost using measured fixture sizes; test at limit and limit+1. Free-for-now remains free; a quota is not a covert paywall or automatic deletion date. Reaching a limit preserves local recovery and gives an honest message.
10. **Logout/room switching:** Tear down subscriptions, bind pending work to its initiating identity/room, prevent late results writing another room, and define retained local-copy visibility on shared devices. Revocation cannot erase bytes already downloaded, but must block later reads/commits.

## Attack and recovery recipe

Use local emulators with synthetic trips and distinct authenticated identities, plus a direct SDK/protocol attacker that bypasses the UI. No production project/credentials, customer content or paid calls. For each failure, assert both the rejected request and absence of unauthorized persisted state/bytes.

| Experiment | Required observable result |
|---|---|
| Private note/asset created, edited, deleted, then share room | Canary absent from all uploaded payloads, room records, storage, metadata and logs |
| Forged role, room, household or raw update | Rejected at trusted boundary; no side effect even when UI validation is bypassed |
| Two devices submit same revision with different content for one household | Visible conflict/resolution policy; never two votes or silent clock winner |
| Two edits based on the same local numeric revision | Stale precondition detected or declared merge policy exercised; content difference cannot masquerade as same version |
| Client A moves a card, B edits its note, A undoes | Only A's permitted move reverses; B's accepted note survives |
| Offline C queues vote/media edit; owner revokes C; C reconnects | No later unauthorized read/write; local unsynced copy remains honestly recoverable |
| Server accepts operation but acknowledgement is lost | Retry results in one effect and one accepted operation identity |
| Switch room/account during upload or sync; clear browser persistence | No cross-room/identity write; explicit recovery/rejoin policy, no invented login continuity |
| Old schema client reconnects after migration | Compatible transition or clear read-only/rejection; no silent field loss |
| Three clients, reordered/duplicate events and bounded backlog | Declared convergence bound or explicit unresolved state; measure real server acceptance, not timers |

Record exact emulator/rules/code versions, seeds, operations, state digests, identity/role matrix and failures. A local proof is necessary for implementation acceptance but does not waive later authorized deployment, physical-device or independent-review gates.
