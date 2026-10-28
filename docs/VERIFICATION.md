# Non-author verification pack (MOT-56) + demo script (MOT-58)

Demo closeout update, 28 Oct: the owner asked for focused demo completion
without excessive review gates. MOT-56 is now the demo acceptance/evidence
pass. **Complete** may be author-checked; **Verified** retains the non-author
meaning below. Current executed evidence is in [DEMO-CLOSEOUT.md](DEMO-CLOSEOUT.md).

## For the non-author checker (MOT-56)

You did not build this. Check each task's acceptance list in
`MoT-Build-Kanban.html` (Ministry of Tourism folder on OneDrive) on the exact
commit you are given. Record pass or fail per criterion, with evidence, your
identity and the commit. Only a task whose every criterion passes on that
commit may move to Verified. The builder cannot do this.

Owner decision (28 Oct 2026): an AI checker with fresh context, which did not
write the code, counts as non-author. It is recorded as exactly that, so a
person can re-check any task later. Tasks in phase 6 (go-live) need owner
access and are not part of this check.

1. Check out the named commit. `npm install`, then `npm run check` must pass
   (vitest plus typecheck of core, bridge, mot-server and web).
2. `npm run dev -w @writers-board/web -- --port 5173 --host 127.0.0.1`, open
   `http://127.0.0.1:5173/?view=trip`.
3. Board: make a trip, add a card, edit it (title, notes, day, time, who can
   see it), move it with the ⋮ menu and by drag, mark a task done, reload.
   Today shows cards dated today in Asia/Bangkok time.
4. Export ZIP → Full backup, and → Copy to share. Unzip both. The copy to share
   has no private card titles anywhere (decode `document.b64` too) and its
   photos carry no Exif. Import the backup: it opens as a new board and
   survives a reload.
5. Host: Create a guest copy with one card unticked. The guest board has only
   the ticked guide cards. Stay and private cards never copy.
6. Review changes: it asks the labeled test adapter. Press Stop: nothing
   changes. Try again, Peek (tool, sources, exact operation), apply one, then
   the other; Undo from the toast removes only the suggested card.
7. Every unavailable surface says so: Muse, routes, checkout, print ordering.
8. At 375 px: no page-level horizontal scroll; every action has a 44 px target
   and works by keyboard (lanes scroll sideways by design).
9. `npm run build -w @writers-board/web`; `META_API_KEY` appears nowhere in
   `apps/web/dist`.

## Three-minute demo script (MOT-58)

Record from the running app; label every simulated element on screen
("Test adapter · Muse not connected", "Sample trip · sample photos").

- 0:00 First screen: MOT logo, traveler, host, tour guide.
- 0:20 Make this my trip: sample board, five lanes, trip brief, photos.
- 0:45 Edit a card (Done), set a day, see it in Today.
- 1:15 Review changes: Stop, try again, peek, apply one, Undo.
- 1:50 Host: Create a guest copy with one card unticked.
- 2:20 Keepsakes: pick the river photo, download the postcard.
- 2:45 Export ZIP menu: full backup or copy to share. Close on "Saved on this
  device".

Recording: `docs/MOT-58-demo.mp4` (3 minutes, 1280×720), refreshed 2026-10-28
against code commit `8c22dcb`. Playwright drives the running app using the
existing `scripts/record-demo.mjs` journey, with longer reading pauses; the
Stop interaction keeps its short delay so cancellation happens before the
test adapter answers. This is real browser video. The caption continuously
labels the sample trip, concept photos and disconnected Muse test adapter.

## Earlier checker report (MOT-56, 2026-10-28, superseded)

An independent subagent checked git HEAD `8a767f8` plus the then-uncommitted
working tree. That is not an exact revision, and the code has changed since, so
it no longer counts toward Verified. Its findings (mot-server `status()`
overclaiming availability; mot-server missing from typecheck) were fixed.
