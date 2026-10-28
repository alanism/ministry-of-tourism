# Magazine verification

Run `npm run check` and the web build first. For reference-driven browser/PDF checks, use `scripts/test-mot-magazine.cjs <city-id>` against the local Vite dev server. It uses fresh sandboxed Chromium contexts, real file bytes and Poppler rasterization. No model calls, uploads or deployment are performed.

Set `MOT_TEST_ORIGIN`, `MOT_PLAYWRIGHT_MODULE` if Playwright is installed outside this project, `MOT_ART_FIXTURES`, and optionally `MOT_EVIDENCE_DIR`, `MOT_PDFTOPPM` and `MOT_PDFINFO`. Each city fixture is `<city-id>-fixture.json` in the supplied directory. Use three cities with rich art and one with deliberately sparse selected art. Fixtures and resulting PDFs/screenshots stay outside the repository.

Each fixture has `cityId`, `name`, an explicitly supplied `countryCode`, `articles`, `places`, optional `notes`, and `assets`:

- Articles: `id`, `title`, plain `body`, and `canonicalUrl`. Places: `id`, `name`, `canonicalUrl`. Use fictional traveler data for CI or genuine public source excerpts; never commit a private journal.
- Traveler notes: `title`, `body`, optional local `day`. Mark the fixture `notesAreFictional: true` when these are QA input. Source articles are not traveler correspondence; populate each role explicitly.
- Art: `id`, `label`, public FCC `src` and `thumb`, explicit layout `role`, `kind`, and `media: {mime, hash, data}`. `hash` is the actual SHA-256 of the raster bytes; `data` is its raster data URL. Original art roles match `MAGAZINE_ART_ROLES` in the core schema.
- Tee photos must be explicitly classified `kind: apparel-mockup`, with `variant: brush | mono | color` and the corresponding `apparel-brush | apparel-map-mono | apparel-map-color` role. No classification is inferred from a file name. Use actual licensed photographs for visual review, rather than one-pixel transport fixtures.

The test routes the supplied classification metadata and original public image bytes. This proves consumer/layout behavior, **not that an upstream catalogue has been classified or published**. Do not report the fixture metadata as a live integration result.

Checks cover first/back sequence (including the stacked jacket at 768/375/280 px), actual page pairs, one editorial slot per image identity, embedded Plex, clean labels, real PDF links, reader controls, saved tee choice, five widths (1920/1280/768/375/280), and selected preview/PDF raster differences at most 4/255. Bangkok additionally checks a byte-identical chosen-tee PDF after importing the package into a clean offline context. The offline test preloads the application; it does not claim an offline cold start. Page identity, runtime errors and browser console warnings/errors are recorded with the results.

Narrow pages reflow their canonical SVG text within the visible page and may grow taller. The reader measures the embedded Plex faces, keeps body text at least 11 CSS pixels, preserves paragraph/contents breaks, and moves later content, credits and folios below expanded text. There is no horizontal reading viewport. The optional fixed print layout and actual PDF keep the A5 composition. Postcard turning rearranges the two printed faces in the reader only. The saved tee choice changes the canonical PDF and editable package.

R6's scripted G8 check inspects every page at 375 and 280 px: the page must fit the actual reader, text ink must stay inside its edges, separate text blocks must not collide or be covered by later opaque panels, source words must survive wrapping, and body text must remain at least 11 px. It uses actual font ink metrics and SVG transforms; font em boxes alone can overlap even when the printed glyphs do not. The full-height spread captures temporarily expose the application's scroll area only after these checks, asserting that every image retains its real viewport width. Every spread is captured at 1920, 375 and 280 px.

The G2 audit rejects duplicate source allocations and repeated physical-page images, except one recorded spine tag on the front/back jacket halves or one recorded panorama on the left/right feature halves. A shared flag on any other slot is insufficient; third uses and wrong sections fail regression tests. Calm backs have a distinct `back-cover` pattern, carried into standard PDF page labels. `pictureDpi` retains source identity, crop, effective dpi and placed dimensions, while the reader receives one low-resolution summary with the count and lowest dpi.

One panorama or jacket tag spanning two physical pages is one shared editorial slot, not unrelated repeated art. Inspect both halves as a spread. Review every page for clipping, source/date accuracy, credits, honest missing-art fallbacks and actual typography. A raster PDF has no searchable font objects; font evidence comes from embedded Plex in each SVG and verified raster output.

Functional and pixel checks do not constitute independent design approval. Record any visual deviations and obtain the design lead's review on the tested revision.

The legacy all-page runner (`scripts/test-mot-art-roundtrip.cjs`) retains its 20-second raster deadline and original comparisons. It takes Poppler's lossless RGB/PPM output and encodes PNGs in the existing browser, checking every RGBA channel after decoding each PNG. This avoids the bundled Poppler PNG writer's compression cost without changing raster pixels or resolution. Each `*-pdf-page-timings.json` records the batch render, per-page PNG conversion, exact pixel checks and total time; the complete batch plus conversion must finish within the same deadline.
