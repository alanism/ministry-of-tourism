# Board checklist

Run before every status report. Keep it short; expand only as integrations go live.

## Automated (must pass)

```bash
npm run check   # vitest run + typecheck; non-zero exit on any failure
```

## First usable board (manual, no keys/accounts/maps)

1. Open the app (`npm run dev -w @writers-board/web`, http://localhost:5173/).
2. Create a trip board. Add a card, edit its text.
3. Move the card to another stage (lane).
4. Open Today: the same card appears with the same content.
5. Reload the page: board, card and stage survive exactly.
6. Export the board package, then import it: layout and assets match, and it opens as a new board.
7. Anything not yet connected says "unavailable" — never a fake price, time or success.

## Reporting

Record the commit hash and the `npm run check` result in the kanban evidence.
Never mark your own work Verified.
