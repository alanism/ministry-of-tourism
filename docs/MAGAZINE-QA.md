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

Narrow text pages use an explicit horizontal reading viewport to keep body text at least 11 CSS pixels, with an optional whole-page fit and a text transcript. Front covers always fit the available width, including sparse-art jackets whose back-cover text needs the reading viewport. This is a reader adaptation of the fixed A5 proof; it should be included in design-lead review. Postcard turning rearranges the two already printed faces in the reader only. The saved tee choice changes the actual canonical PDF and editable package.

One panorama or jacket tag spanning two physical pages is one shared editorial slot, not unrelated repeated art. Inspect both halves as a spread. Review every page for clipping, source/date accuracy, credits, honest missing-art fallbacks and actual typography. A raster PDF has no searchable font objects; font evidence comes from embedded Plex in each SVG and verified raster output.

Functional and pixel checks do not constitute independent design approval. Record any visual deviations and obtain the design lead's review on the tested revision.
