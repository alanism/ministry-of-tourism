# FCC artwork metadata and preview verification

MOT-75 publishes the canonical 200-city registry. MOT-84 generates strict, content-derived ArtRefs and reports category coverage. MOT-86 previews a selected rendition and only fetches its original on Add. The normal art browser excludes apparel by explicit kind; the magazine uses a separate, city-only apparel loader. Unknown/restricted rights retain actual source credit.

## Rebuild and validate

Run from this repository with a read-only FCC source checkout:

```powershell
node scripts/build-fcc-destinations.mjs $env:MOT_FCC_SOURCE
node scripts/build-fcc-artwork.mjs $env:MOT_FCC_SOURCE
node scripts/build-fcc-destinations.mjs $env:MOT_FCC_SOURCE
npm run check
npm run build --workspace apps/web
```

The first destination build supplies the canonical origin/country identities; the final build reconciles the newly generated manifest rather than stale catalog files. Only the manifest's referenced shards are live. Old unreferenced JSON is not deleted by this generator. FCC source and deployment are never modified. No original gallery images are bulk-read or copied: small apparel headers provide actual dimensions, and the source release supplies hashes. All entries/crops validate before the first output write. Writes/read-back use four bounded workers.

An optional second argument to either generator selects a separate output directory. Compare the emitted metadata SHA-256 and every referenced file across two builds. The art generator retains explicit `credit` and `rightsStatus` from the existing MoT FCC manifest/pack; entry metadata overrides it. Without an explicit rights grant, the default is `unknown`. Publisher credit is Foreign Clubbers Correspondence. `brush-portraits.json.cities` and declared `tshirtCollections` are apparel. Its separate `artworkMaster` is an original drawing. Category normalization never classifies a tee as a map from words in its label. Unknown origins are named in `build-report.json`, never silently renamed.

The source currently supplies no flat-map or sticker category; do not claim a 50-flat-map sample. The publication regression samples 50 real cities' mono/color tee entries and validates that they remain apparel. All generated entries are parsed by the full catalog regression.

## Browser check

Start the normal Vite server, then set `MOT_TEST_ORIGIN`, `MOT_FCC_SOURCE`, optional `MOT_PLAYWRIGHT_MODULE` and `MOT_EVIDENCE_DIR`:

```powershell
node scripts/test-mot-art-preview.cjs
```

Uses sandboxed Chromium and actual FCC San Sebastián/Barcelona hotel rendition bytes, supplied through explicit local transport fixture URLs. The test uses a real source rendition as its available original, with its actual pixel dimensions/hash. It does not edit image pixels, fake a live CORS deployment, or publish fixture records. The selected original is byte-verified and decoded before any board command. It keeps original bytes, crop, source, credit and rights, makes one atomic placement and preserves the trip's destination/cards.

Checks six widths (1920/1440/1280/768/375/280), overflow, targets, Plex/400/600/type ramp, one visible primary, other-city origin, source-link keyboard access, focus return, Escape after failure, deferred originals, one Add/Undo and personal-package round trip. Fault cases exercise three bounded preview retries and failed-original no-write. A source with only a small rendition can still be added; an actual A5 issue warns below 300 dpi. Unit checks also reject wrong hashes/dimensions/apparel and cancel during decoding before any document/byte registration.

MOT-85 now uses the canonical country registry for city/all-country scope, populated/zero category counts, missing-city/category offers and an explicit country question. Country choice filters the artwork only. A complete public metadata snapshot can be kept as one of at most 12 dated copies; retries and failures never replace it with a partial batch. Restored copies revalidate their origin membership before use. Original/rendition image bytes are not prefetched into that metadata cache. Root style/manifest metadata is separately bounded and schema-validated, so a preloaded app can reopen its known public catalog while offline. This does not provide an offline cold start. Empty collections offer the normal personal-photo picker; image decode/hash precede one atomic private placement and one Undo. No FCC origin is invented for a personal photo.

The guide's destination/export scenarios have separate acceptance. None of these builder checks supplies Opus design sign-off. Browser-plugin support was unavailable; sandboxed Playwright was used.
