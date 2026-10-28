# Hosting configuration and dry run (MOT-55) — NO DEPLOY

`firebase.json` in this repo no longer targets `writersboard`. It describes
only the MoT static site (hosting target `mot`, SPA rewrite to `index.html`).
Nothing has been deployed and nothing here grants deploy approval; deploying is
MOT-68 and needs the owner's explicit approval.

## Dry run: exactly what would deploy

Regenerate with `npm run build -w @writers-board/web`, then list
`apps/web/dist`. Run on 2026-10-28 at commit `8c22dcb`: **759 files, 8,900,825 bytes (8.49 MiB).**

| Path in `apps/web/dist` | Files | Size | What |
|---|---|---|---|
| `index.html` | 1 | — | The app shell |
| `assets/` | 190 | 4,981,596 bytes | Bundled app code and IBM Plex plus Writer's Board writing fonts |
| `artwork/` | 558 | 3,724,405 bytes | FCC artwork catalogue (JSON metadata only; images stay on the FCC site) |
| `sample/` | 5 | 164,055 bytes | Sample photos and their README |
| `brand/` | 1 | 9,534 bytes | The MOT wordmark |
| `agents.md`, `trip-agents.md`, `llms.txt`, `chatgpt-logo.svg` | 4 | — | Notes for AI agents and a Writer's Board asset |

Would **not** deploy:

| Item | Why |
|---|---|
| `packages/mot-server` | Not deployed; no key; reports unavailable |
| `packages/chatgpt-server` function, Firestore | Removed from this repo's config (Writer's Board concerns) |
| Any secret | `META_API_KEY` appears nowhere in `dist` (checked with rg at `8c22dcb`) |

To deploy later (MOT-68), the owner must create or confirm the Firebase site
for target `mot`, approve deployment explicitly, then run the Firebase deploy
for hosting only. Until then this file is configuration only.
