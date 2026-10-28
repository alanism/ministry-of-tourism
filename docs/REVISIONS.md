# What "same revision" means (MOT-11)

One authoritative local session approves changes. No distributed transactions.

- **Board identity:** `boardId` is new on create, copy and import. Tokens from
  another board never match, even with identical content.
- **Board revision:** a monotonic counter in `tripClock`, outside every undo
  scope. It only goes up — including across undo, redo and reload.
- **Card revisions:** `tripRevs[cardId]`, also outside undo. After every
  execute, undo, redo or applied remote update, the session diffs card
  snapshots, bumps the board revision once, and stamps each changed card.
- **Comparison token:** `{ boardId, cardRevs: { [cardId]: rev } }` for exactly
  the cards a proposal touches. Approving checks every entry against current
  state; any mismatch (including a missing/deleted card) makes it stale and
  nothing lands.
- **Replay:** applied proposal ids live in `tripApplied`, outside undo.
  Applying the same proposal id again is a no-op.
- **Prevalidation:** every selected op is validated against current state
  before any op is applied, because Yjs does not roll back a throw. The ops
  then run on a throwaway copy of the document first; only if all of them
  succeed do they run for real, in one transaction (one revision bump, one
  undo step). A run-time failure lands nothing.
- **Coverage:** every existing card an op touches must be in the token, or the
  proposal is stale. Agents cannot change who can see a card or touch a
  private card.
- **Partial approval:** approving some ops records which ops landed and the
  card revisions they left (`tripApplied[id] = { ops, revs }`). The rest stay
  approvable: a revision this proposal produced itself is not someone else's
  edit, but any other change to a covered card still makes the rest stale.
  When every op has landed, the record becomes `true`.
- **Undo:** each proposal has its own undo stack (`proposal:<id>`).
  `undoProposal` reverts that proposal's applied ops and keeps later edits to
  other cards. A person's own Undo never removes a proposal's changes.
- **Schema versions:** `schemaVersion` is stored in `tripMeta`. `loadTrip`
  runs `TRIP_MIGRATIONS[v]` step by step up to the current version and refuses
  a version it cannot migrate.
