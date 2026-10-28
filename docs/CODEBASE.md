# Codebase map (MOT-01 baseline)

Recorded 2026-10-28 at fork commit `99b85e0` (after Writer's Board `3e231e4`).

## Baseline (verified by running, not assumed)

| Step | Result |
|---|---|
| `npm install` | 389 packages added, 394 audited; 2 vulnerabilities (1 moderate, 1 high) reported by npm audit — pre-existing, not fixed here |
| `npx vitest run` | 32 test files passed, 246 tests passed, 0 failed |
| `npm run typecheck` | Pass (`tsc` on core, bridge, web) |

Pre-existing failures: none in tests or typecheck. The npm audit findings above are the only known baseline issue.

## Q&A

**Where do commands live?** `packages/core/src/commands/`. `define.ts` holds
`defineCommand`, `CommandDef` (`name`, `access: read|write|sensitive`,
`humanOnly`, zod `input`, `run`), `CommandError`/`CommandErrorCode`,
`toToolDefinition` and `museToolClass`. Concrete commands are in
`board-commands.ts`, `item-commands.ts`, `coach-commands.ts`,
`export-commands.ts`, `import-commands.ts`. A command is the only way to
change a board; `run` must validate everything before the first write
because Yjs does not roll back a throw inside `doc.transact`.

**What is the Yjs document?** `packages/core/src/doc/model.ts`:
`boardParts(doc)` returns named maps (`meta`, `cards`, `notes`, `images`,
`connections`, `guides`, …). `createBoard`/`initializeBoard` set
`schemaVersion` (1) under `SYSTEM_ORIGIN`. `persist.ts` is
`encodeBoard(doc)` → bytes and `loadBoard(bytes)`, which rejects a
mismatched `schemaVersion`. Editable text is a `Y.Text`.

**How do sessions and undo work?** `commands/session.ts` `BoardSession`
runs commands for any number of actors. Each actor gets an origin and
their own `Y.UndoManager` over `boardScopes(parts)`, so one actor's undo
never removes another's work. `beginRun`/`endRun` group an agent's burst
so one undo removes the whole run. Agents are refused writes in Solo
mode (`solo_mode`); `humanOnly` commands refuse agents (`human_only`).

**How do files export/import?** `doc/board-file.ts`: format
`writers-board` v1, `document` as base64 Yjs update, readable `board`,
`images` as data URLs by content hash. `readBoardFiles` validates with
zod and checks each document opens via `loadBoard`.

**How do agents reach a board?** Three surfaces over the same commands:
`apps/web/src/state/agentApi.ts` exposes `window.writersBoard`;
`apps/web/src/ui/AgentView.tsx` serves `/?view=agent`;
`packages/bridge` is an MCP relay (`call`/`result`/`hello` in
`protocol.ts`) — the board connects out, the bridge stores nothing.
`packages/chatgpt-server` is the Firebase Function pattern MoT's server
adapter will follow. `apps/web/public/agents.md` and `llms.txt` are the
agent-facing notes.

**Where does the web app keep boards?** `apps/web/src/state/boards.ts`:
one `y-indexeddb` `IndexeddbPersistence` per board (`writers-board:<id>`),
registry in localStorage. Picture bytes live by content hash in
`apps/web/src/state/blobs.ts` (database `writers-board-blobs`).

**What will MoT add?** A separate trip document in
`packages/core/src/trip/` (see `docs/FORK.md`), reusing IDs, commands and
undo conventions without touching Writer's Board boards.
