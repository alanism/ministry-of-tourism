# Development

Use Node.js 22.12 or newer and npm. Run commands from the repository root unless a command supplies its own prefix.

```sh
npm ci
npm --prefix apps/web run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/?view=trip`. Trip creation, local persistence and file exports work without a model key. Optional model configuration is described in [Muse runtime](MUSE-RUNTIME.md).

## Codebase map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/App.tsx` | Application entry |
| `apps/web/src/trip/TripApp.tsx` | Trip screens and navigation |
| `apps/web/src/trip/agentApi.ts` | In-page `window.motTrip` interface |
| `apps/web/src/trip/trip-store.ts` | IndexedDB persistence, reopen and recovery |
| `apps/web/src/trip/trip-assets.ts` | Local trip media |
| `apps/web/src/trip/artifacts.ts` | HTML, PDF and ZIP export lifecycle |
| `apps/web/src/trip/export-snapshot.ts` | Shared city artwork selection and lookup cancellation |
| `apps/web/src/trip/export-image.ts` | Export image dimensions and bitmap cleanup |
| `apps/web/src/artwork/` | Catalogue loading, browsing and image preparation |
| `packages/core/src/trip/` | Trip model, commands, packages, magazine layout and domain rules |
| `packages/core/src/export/` | PDF construction |
| `packages/mot-server/src/` | Optional model runtime, public catalogue MCP and shared-room services |
| `apps/web/public/` | Published static assets, artwork catalogues and agent guidance |
| `scripts/` | Catalogue generators, audits and browser/emulator checks |
| `docs/` | Current reference material and revision-specific evidence |

The three npm workspaces are `@mot/web`, `@mot/core` and `@mot/server`. Shared core exports are declared in `packages/core/src/index.ts`; browser storage and UI belong in the web workspace. Existing trip writes use the validated command layer.

## Tests and build

The standard repository check runs Vitest and all three workspaces' TypeScript checks:

```sh
npm run check
npm --prefix apps/web run build
```

Five additional Node test files cover script tooling. They are outside the existing Vitest include patterns and run separately:

```sh
node --test scripts/audit-mot-fcc-coverage.test.mjs scripts/build-public-fcc-catalogue.test.mjs scripts/mot121-magazine-type.regression.test.mjs scripts/mot121-shop-inventory.test.mjs scripts/mot121-sticker-coverage.regression.test.mjs
```

For focused export work:

```sh
npx vitest run apps/web/src/trip/export-snapshot.test.ts apps/web/src/trip/export-decode-cancel.test.ts apps/web/src/trip/export-bitmap-cancel.test.ts apps/web/src/trip/apparel-preparation.test.ts apps/web/src/trip/export-apparel-cancel.test.ts
```

The `test-mot-*.cjs` browser checks and `verify-room-*.mjs` emulator checks have their own server, browser, fixture and service requirements. Read the corresponding script and topic guide before running them. Passing the unit suites does not establish live integration or cross-browser acceptance.

## Generated assets and local cleanup

`node_modules/`, `apps/web/dist/` and `.firebase/` are generated local directories. A cleaned checkout needs `npm ci` before testing and a build before preview or deployment. Other worktrees may link to dependency folders, so check links before removing a shared install.

`apps/web/public/` is tracked source for the build. It includes the artwork catalogues, fonts, product film and brand assets; it is not disposable build output. `scripts/build-trip-guidance.ts` generates the public trip guide from `packages/core/src/trip/guidance.ts`.

GitHub source and Firebase publication are separate. Follow [Git workflow](GIT-WORKFLOW.md) and [Hosting handoff](HANDOFF.md) for release work. Historical checks are indexed in [Documentation](README.md).
