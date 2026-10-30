# WP6 — App-only origins verification

`scripts/test-mot-origins-app-only.cjs` is the app-only companion to the
immutable `scripts/test-mot-origins.cjs`. It reuses that harness's exported
`settings` and `negativeCorsTest` helpers and the shared destination-UI
contract in `scripts/mot-browser-contracts.cjs`
(`createTripThroughDestination`). It adds no dependencies and modifies no
existing harness.

## Scope

Verified in a real browser, from the app origin:

- Real cross-origin fetch of the FCC feed, manifest, and artwork
  (explicit `MOT_FCC_*_URL` values; nothing is guessed).
- Canvas non-taint for the downloaded artwork.
- Actual UI photo import (card actions → file chooser) using the exact
  downloaded artwork bytes.
- Save/reload asset-hash stability, with an assertion that persisted media
  uses hashes or stable URLs (no `blob:` or signed/expiring URLs).
- Screenshot plus a JSON receipt (`app-only-origin-result.json`) recording
  the git SHA, origin, fetch metadata, hashes before/after reload, and
  runtime errors. Failed runs also retain a receipt and, when possible, a
  `trip-app-only-failure.png` screenshot in the evidence directory.

Out of scope for this runner: PDF/export paths are never called. This
app-only pass does **not** satisfy the retained device gate, which remains
a separate requirement; expanded WP7–WP9 acceptance is likewise tracked
outside this runner.

## Commands

```sh
# Negative CORS self-test — runs without any MOT_* fixture values
node scripts/test-mot-origins-app-only.cjs --negative-self-test

# Fail-fast configuration validation — no browser is launched
MOT_TEST_ORIGIN=https://<origin> \
MOT_FCC_FEED_URL=https://foreignclubberscorespondence.web.app/<feed> \
MOT_FCC_MANIFEST_URL=https://foreignclubberscorespondence.web.app/<manifest> \
MOT_FCC_ART_URL=https://foreignclubberscorespondence.web.app/<art> \
node scripts/test-mot-origins-app-only.cjs --validate-config

# Full app-only run (same env as above; optional MOT_TEST_CITY /
# MOT_TEST_COUNTRY / MOT_EVIDENCE_DIR / MOT_PLAYWRIGHT_MODULE)
node scripts/test-mot-origins-app-only.cjs
```

A passing full run prints the JSON receipt and writes it, together with
`trip-app-only.png`, into `MOT_EVIDENCE_DIR` (or a temporary
`mot-app-only-evidence-*` directory).
