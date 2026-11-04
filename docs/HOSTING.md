# Hosting configuration and historical dry run

MoT is available at [ministryoftourism.web.app](https://ministryoftourism.web.app). The current `firebase.json` describes the static web app: Hosting target `mot`, public directory `apps/web/dist`, a build predeploy hook, cache headers and an SPA rewrite to `index.html`. The existing site/target mapping is documented in the [hosting handoff](HANDOFF.md).

The public source and hosted deployment are versioned separately. Publishing documentation to GitHub does not deploy the app, optional server or local-preview features. See the [Git workflow](GIT-WORKFLOW.md) and [implementation boundaries](../IMPLEMENTATION-NOTES.md). This documentation correction performed no deployment.

## Historical MOT-55 dry run: 28 October 2026

The following inventory was recorded before the hosted launch, at commit `8c22dcb` on 28 October 2026: **759 files, 8,900,825 bytes (8.49 MiB).** It describes that historical build, not the current source or hosted asset inventory. For a new candidate, build with `npm run build -w @mot/web` and inspect its own `apps/web/dist`.

| Path in `apps/web/dist` | Files | Size | What |
|---|---|---|---|
| `index.html` | 1 | — | The app shell |
| `assets/` | 190 | 4,981,596 bytes | Bundled app code and IBM Plex plus additional fonts |
| `artwork/` | 558 | 3,724,405 bytes | FCC artwork catalogue (JSON metadata only; images stay on the FCC site) |
| `sample/` | 5 | 164,055 bytes | Sample photos and their README |
| `brand/` | 1 | 9,534 bytes | The MOT wordmark |
| `agents.md`, `trip-agents.md`, `llms.txt` | 3 | — | Notes for AI agents |

Excluded from that historical static-site dry run:

| Item | Why |
|---|---|
| `packages/mot-server` | Not part of the static-site artifact; the dry run established no live model connection |
| Any secret | `META_API_KEY` was absent from that `dist` (checked with rg at `8c22dcb`); this is evidence for that revision |

For a future deployment, confirm the existing site and `mot` target, review the intended source and hosted versions, and use the separately authorized release process in the [hosting handoff](HANDOFF.md). The historical dry run is not approval for a new release or evidence that a local backend is publicly available.
