# Ministry of Tourism provenance

MoT reuses the board engine from [Writer's Board](https://github.com/alanism/ucc-writers-board-notebook).
The trip domain lives in `packages/core/src/trip/` and uses a separate document and storage from the inherited writing routes.
FCC remains a separate content and commerce provider. Its source repository, content and deployment are not part of this code license.

This public source checkpoint begins with a fresh Git history. Internal planning, account bindings, private trip data, local history and uncleared sample media are excluded.
The original local development history is retained separately. See the root README and THIRD_PARTY_NOTICES for code licensing, content-use boundaries and component attribution.

Run `npm run check` and `npm --prefix apps/web run build` before reporting an implementation result. All trip writes use validated commands; an unconfigured integration must say it is unavailable.
