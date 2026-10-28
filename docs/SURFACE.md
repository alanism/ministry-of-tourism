# MoT surface: keep, hide or remove (MOT-02)

Decision: no grand rewrite. Keep the board engine, hide writing-only features
from the MoT surface, remove nothing yet. Hidden code stays dormant and tested;
a later task may delete it once the trip UI replaces it.

| Feature | Decision | Reason |
|---|---|---|
| Board canvas (`src/board/`), cards, notes, images, connections, guides | Keep | The MoT Board view reuses it (MOT-17) |
| Command layer, `BoardSession`, per-actor undo, agent API, bridge | Keep | Foundation for trip commands (MOT-12) |
| Board/file export-import (`board-file.ts`) | Keep | Pattern for trip packages (MOT-30/31) |
| Notebook, Typewriter (`src/writing/`, `mode: notebook/typewriter`) | Hide | Writing-only. Tabs removed in `ModeTabs.tsx`; not reachable in MoT UI |
| Coaches, lenses, storyboard, reverse-engineer, voice | Hide | Writing coaching, not trip planning. Dialogs stay in code, off the first screens |
| ChatGPT server (`packages/chatgpt-server`) | Hide | Pattern only for the future server adapter. Never deploy (MOT-55 is config + dry run) |
| Framework/writing content (`content/`, framework cards) | Hide | Writer's Board curriculum; trip cards replace it (MOT-10) |

Agent reachability: hidden features are not reachable from the MoT trip
surface. The trip session (MOT-12) will expose only trip commands; Writer's
Board commands remain available only on Writer's Board boards, which MoT
does not open.
