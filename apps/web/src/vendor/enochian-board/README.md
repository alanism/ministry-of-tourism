# Enochian board controls

Based on **Enochian UI UX Elements** by alanism / UnCommon Core,
https://github.com/alanism/Enochian-UI-UX-Elements.

The inherited upstream notice was CC BY-NC 4.0. On 28 October 2026, the owner confirmed authorship and ownership and authorized this MoT component code copy under the repository's root MIT license, including commercial reuse. The earlier notice is retained here as provenance; the upstream repository's license is unchanged. Fonts and other third-party assets retain their own licenses. See the root `THIRD_PARTY_NOTICES.md`.

Source prototype: `volume-3/index.html` in the Enochian UI UX Elements project.
Public reference: https://uiux-nonhumanintelligence.web.app/UIUX

Adapted Push Button 02 (`.pcb`), Slider 03 (`.dmp`), Joystick (`.jp`),
and the Ivory material plate (`.fx`). The demo readouts, sounds and alternate
hold action are omitted; the controls act on the real board. Material CSS stays
scoped here, as with the existing Enochian keyboard. React integration is in
`ui/BoardControls.tsx`; camera math is in `ui/board-camera.ts`.

Draw three uses the existing `cards_draw` command and deal animation. The native
range controls 15–400% zoom with a logarithmic response. The thumbstick pans
at 480 screen pixels per second at full deflection, with diagonal normalization.
Pointer release/cancel, lost capture, focus loss, hidden page and unmount stop
movement. Arrow keys provide the same control while the joystick is focused.
The mouse wheel scrolls the canvas without changing zoom; Shift+wheel pans
sideways. Trackpad pinch (Ctrl+wheel events) keeps cursor-anchored zoom, and
the slider remains available. Wheel movement is scaled by the current zoom
so the canvas moves by the same screen distance at different magnifications.

Current sizing and placement: `DrawThreeButton` sits immediately to the right
of the top navigation, with its cap height at 110% of that bar's measured height.
The label is `DRAW 3` in IBM Plex Sans Bold 700, loaded through `main.tsx`.
The lower toolbar starts one character width (`1ch`) below the full header/socket
bottom, measured by `ModeTabs`; `Toolbar` observes header changes so the side
panels follow its new position.
`ModeTabs` measures the bar with ResizeObserver; the navigation scrolls on narrow
screens to keep the draw button visible. `BoardControls` contains only zoom and
joystick on an Ivory panel, right-aligned above the view-option bar with a 12px
gap. Its total height is 125% of the bottom bar's measured height; `ViewCorner`
observes that bar and the complete control stack. The coach panel ends 12px
above the stack and keeps its own scrolling area. The joystick and slider are
compact to fit that panel.
The bottom view bar's trash icon is a native button for removing the selected
card. It uses the existing command, throw animation and Undo feedback; Remove
and Delete remain available. It is disabled without a selected card, and its
Enter/Space activation does not trigger the board's writing shortcut.
Verified at 1440px, 1024px and touch-mobile 390px widths. Earlier oversized and
top-center layouts are superseded.
