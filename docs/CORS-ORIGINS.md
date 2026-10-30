# MOT-98 real-origin check

Run `node scripts/test-mot-origins.cjs` with these environment variables:

| Setting | Value used on 29 October 2026 |
| --- | --- |
| `MOT_TEST_ORIGIN` | `http://127.0.0.1:5196` or `https://ministryoftourism--mot-spark-check-z1ojmqve.web.app` |
| `MOT_FCC_FEED_URL` | `https://foreignclubberscorespondence.web.app/feeds/cities/san-sebastian.json` |
| `MOT_FCC_MANIFEST_URL` | `https://foreignclubberscorespondence.web.app/output/prototypes/city-pages/journal/city-art.json` |
| `MOT_FCC_ART_URL` | `https://foreignclubberscorespondence.web.app/output/illustrations/city-stickers-expansion/tulum/object-1.png` |
| `MOT_EVIDENCE_DIR` | A writable evidence directory outside the repository |
| `MOT_PLAYWRIGHT_MODULE` | Installed Playwright module path, if ordinary module resolution is unavailable |

For MOT-101, change only `MOT_TEST_ORIGIN` to the released production origin. An origin must have no path, query or credentials. This check creates a synthetic trip in a fresh browser context; it does not deploy anything. The preview above expires on 30 October 2026 at 17:33 Bangkok time.

The flow is: create a San Sebastián trip through the destination picker; anonymously fetch the real FCC feed, manifest and artwork; decode and draw the artwork into a readable canvas; create a synthetic card through validated commands; attach the unmodified fetched image through the actual photo chooser; wait for storage completion; persist and reopen; export and retrieve an art-containing PDF through the public trip API. The Tulum drawing is a transport fixture, not San Sebastián editorial content. This does not test the FCC picker UI.

The runner asserts the original's SHA-256 survives reload, the document has no object/expiring media URL, and the PDF's MIME, byte count, hash, image objects, inventory and board/revision receipt match. Artifact download URLs may be temporary; they are not stored media references. Board identity belongs to the artifact receipt; the PDF writer receives rendered pages and a title, so identical rendered content produces identical PDF bytes even for different synthetic board IDs.

Each run also proves a separate synthetic no-CORS image blocks fetch and taints a canvas, while its CORS positive control remains readable. Setting `MOT_FCC_ART_URL` to `https://foreignclubberscorespondence.web.app/admin` must exit 1 with that URL in `Public FCC fetch blocked or unavailable`; do not open that endpoint to make the test pass. `--negative-self-test` runs only the synthetic controls.

No responses are intercepted or mocked. Chromium runs headless with its sandbox enabled; Browser plugin was unavailable. The existing 55-second origin budget and 12/15-second fetch/navigation limits are unchanged. For this Windows run, `TEMP` and `TMP` pointed at the evidence disk with adequate space for ephemeral browser profiles.

Both origins passed against live FCC version `9c36fe186ebe8d38`: original 2,552,405 bytes, 1254×1254 pixels, SHA-256 `799f4ba03ee14d90d6aecb0b4ab7101a08df7f2203c551714b3687291077a43c`; PDF 5,272,208 bytes, SHA-256 `7ee8fcc667b72b6532c7b1d1af51e6dd45458e75e3e6cba3119a5126ad11b36c`. No application runtime errors occurred. Saved JSON now includes the negative controls as well as positive results.

Local app source was `8b77ffc`; the remote preview remains exactly the owner-approved `b657c2b`, Hosting version `518c9aa0d648a88d`. The runner change itself is not deployed. Release receipts, screenshots, PDFs, RED logs and actual Muse Spark review responses are in `Design Sprints/Build-Spark-Tasks-2026-10-29` in the external planning workspace. This is engineering evidence, not Opus design acceptance, a physical iOS test or a production MoT release.
