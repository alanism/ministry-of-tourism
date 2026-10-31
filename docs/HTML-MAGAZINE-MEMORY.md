# MOT-119 desktop memory characterization

1 November 2026. Integrated code `e26ec8775aee11d7a6e08355eac28c3ebfc0f29b`
on `codex/local-release-consolidation-20261031`, retaining the prior `017d0ad`
board/recovery/catalog candidate. HTML commits `2ec3628` / `d67fe0d` were applied
as `7423282` / `f2878c5`; the renderer conflict preserves G6 surface isolation.
This is local implementation evidence, not production or physical-Safari acceptance.

## Observed memory cost

**The dedicated Chromium process tree reached an observed 1,597.4 MiB private
memory peak and 1,757.5 MiB summed working set.** Stable post-GC heap does not
negate this cost or establish mobile suitability. The working-set sum includes
shared pages in multiple browser processes and is not a unique physical-RAM total.
Sampling was approximately every 0.4 seconds; brief peaks can be missed.

Windows process-tree sampling was restricted to the dedicated test browser and
its descendants. CDP recorded JS heap, documents and nodes. An external 3 GiB
private-memory guard protected the isolated test process; it never fired and is
not a product limit. Fixture generation and the test runner are outside the
browser measurements. Five synthetic PNGs contain high-entropy pixels, solid
regions and removable public QA metadata: exactly 50 MiB source, 64 MP aggregate,
with no source image above 10 MiB or 16 MP.

| Case | Observed result |
| --- | --- |
| 50 MiB source + 64 MP + 128 pages | Source-SVG working-budget refusal in about 2 seconds; unchanged trip, failed operation, no ready artifact |
| Same media + 13 pages | 91,494,585-byte HTML; five represented images and all 12 complete text tails |
| Export, forget, GC repeated three times | 18.0 / 17.2 / 17.0 seconds; post-GC heap 16.73 / 16.79 / 16.83 MiB, with 490 DOM nodes each |
| Cancel after collecting two originals | Cancelled operation; no returned artifact; original document unchanged |
| Add another image beyond 50 MiB total | Explicit source-limit failure in about 182 ms; no ready artifact |
| Moved large HTML in fresh offline browser | App never opened; no rendering requests, five embedded image hashes match the receipt, metadata absent, all text tails retained at desktop/narrow widths |

The source-SVG working preflight counts both variants and repeated embedded-font
CSS in generated pages, even though final HTML embeds the font stylesheet once.
It is a conservative intermediate-work budget. It does **not** establish that the
final serialized file would exceed 128 MiB. The corrected error distinguishes
this refusal from the separately enforced serialized-output limit. Source, decode,
page and output ceilings are independent and do not promise acceptance when all
ceilings are combined. No ceiling, test, timeout or compiler setting was relaxed.

## Integration corrections and evidence

New tests first reproduced collection/inventory of board-only images, suppression
of explicitly saved apparel also used on the board, and the misleading working-
budget error. HTML now collects its magazine selection; native ZIP keeps board
media. A card or explicit magazine tee can still intentionally use the same asset.
Actual owner-authorized Astra review closed the two follow-up findings by code
inspection at `e26ec87`; it did not independently rerun the reported tests.

`npm run check`: 1,196 tests / 181 files and four TypeScript projects pass.
The production web build passes. Existing harness files remain unchanged.
Full measurements, fixtures, screenshots, hashes and negative controls are in
`screenshot journey map/MOT-119-Memory-Integration-2026-11-01/` in the planning
workspace. Initial failures and pre-correction wording are retained separately.

Physical iPhone/iPad Safari remains explicitly pending. No device memory guarantee,
catalog R23 acceptance, full MOT-133/135 acceptance, push or deployment follows.
