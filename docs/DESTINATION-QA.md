# Destination picker QA (MOT-77)

Run `npm run check` and `npm run build -w apps/web`. Start Vite on 127.0.0.1:5198.
Set `MOT_PLAYWRIGHT_MODULE` to an installed Playwright module and `MOT_EVIDENCE_DIR` to a writable evidence directory, then run `node scripts/test-mot-destination.cjs`.

The script checks the tag wall, Donostia alias, empty preview, typed-country question and seven-card preservation at 1920, 1440, 1280, 768, 375 and 280 px. It asserts Plex 400/600, the kit type sizes, 44 px controls and no horizontal overflow. It checks active keyboard results scroll into view, two quick Create clicks open exactly one board, changing destination leaves card objects unchanged, and the board switcher opens the original trip without changing its destination.

A second browser context preloads application modules, blocks the registry request, clears the destination cache, then goes offline. The included 200-city index resolves Eivissa to Ibiza Town and creates an empty trip without a saved registry. This is not an offline cold-start guarantee.

The bundled list and published JSON are generated together by `node scripts/build-fcc-destinations.mjs <read-only-FCC-source> [output-directory]`. Explicit Airport Tag collection metadata supplies 150 tag images; the other 50 cities retain the plain tag. No image is inferred from a city name. Counts exclude apparel. The included copy has no invented retrieval date; refreshed/saved copies retain their actual retrieval date.

The existing five-second registry deadline now settles headers and JSON reads even when injected work ignores abort. Cancellation retains the exact dated saved copy, or the included list without inventing a retrieval date. Late responses are discarded and cannot replace the cache. `destination-settlement.test.ts` exercises stalled headers/body, cancellation and the unavailable case without saved/included data. The existing maximum timeout, country/schema rules and three UI retries are unchanged. The external WP2 destination-deadline helper holds actual publication JSON completion and checks the real deadline, all 200 included cities, Donostia search and no late cache write at six widths.

Known boundary: screenshots use Chromium, not a physical phone. Opus owns independent design approval. Other app-surface reference scenarios belong to their own tasks.
