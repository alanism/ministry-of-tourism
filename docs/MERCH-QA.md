# FCC apparel QA (MOT-102)

Run `npm run check` and `npm run build -w apps/web`, then start Vite on 127.0.0.1:5198. Set `MOT_PLAYWRIGHT_MODULE` to installed Playwright and `MOT_EVIDENCE_DIR` to the output directory.

Run `node scripts/test-mot-apparel-live.cjs <city>` for bangkok, kyoto, lisbon and san-sebastian. This uses actual published FCC ArtRefs and original image bytes. It checks the named brush/mono/colour choices, distinct style/jacket photos, complete embedded sources, city-only links, six viewport widths, a real new-tab shop landing, no referrer and no application errors. It saves the actual page SVGs and screenshots. No local image/classification replacement is used.

Set `MOT_TEE_PDF=1` for one run to export a real shared PDF and verify its bytes and two city-only link annotations. Clear that variable afterward. Existing `mot-pdf-raster.cjs` retains its 15-second deadline and native 1184 by 1680 pixels. The tested actual San Sebastián tee/jacket pages compare at 0/255 to their PDF rasters, below the unchanged 4/255 gate.

For fault injection, set `MOT_TEE_MISSING=mono` (remove one metadata variant and update its manifest count) or `MOT_TEE_FAILED=mono` (fail that photo request). Use separate evidence folders and clear each variable afterward. Both cases retain brush/colour and compose two real tee pages without an empty frame. The failed-photo case records the expected browser transport errors and one issue warning.

Run `node scripts/test-mot-shop-cities.cjs <begin> <end>` for bounded ranges covering canonical rows 0 through 200. This navigates the actual public shop and reads its selected city; HTTP 200 alone is not enough. Its default batch is ten cities. Image/media/font requests are blocked and WebGL is disabled only in this routing check; it makes no photo, stock or checkout claim. Four workers and 45–50-city batches completed in under 17 seconds on the recorded run. Do not interpret the initial shop HTML's two placeholder options as its final city list: its runtime loads all 200.

Unit regressions cover current canonical catalog ordering, checksum/dimension failures, preserving the rest of a batch, no-apparel omission, missing named variants, all 200 canonical shop URLs, existing strict classification/privacy and saved-choice/package round trips. Explicit saved choices stay first; named roles determine fresh brush/mono/colour choices. Catalogue-only fourth styles do not fill a missing named style. No classification is inferred from a filename.

Independent visual sign-off remains with Opus. The full-issue layout and previously recorded review holds are unchanged. Browser plugin not available; these checks use sandboxed Playwright Chromium, not a physical phone or a checkout transaction.
