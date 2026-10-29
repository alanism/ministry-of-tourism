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

For the complete MOT-84 audit, run `node scripts/verify-mot-artrefs.mjs <public-root> <receipt.json>` separately against the bundle and each isolated rebuild. It validates every ArtRef, display/origin/country binding, collection classification, unique identity and nonempty manifest shard. Four deliberately corrupted entries must fail, including a schema-valid tee disguised as a map. Compare the two receipts' complete `files` maps for byte identity. `stablePayloadSha256` excludes only identity, retrieval date and source version, so a newer publisher epoch can be distinguished from a changed image/crop/credit without silently refreshing saved artwork. The generator's own metadata digest covers a different file set; do not equate the two digest formats.

An isolated `policy-fixture` run may seed the manifest/pack with `credit: "QA PACK CREDIT — FIXTURE ONLY"` and `rightsStatus: "approved"`, then invoke the verifier with a third argument `policy-fixture`. This is synthetic policy-inheritance evidence, never an actual rights grant or publishable catalog. The real default remains unknown unless the source explicitly grants rights. Existing unit checks separately cover entry-level restrictions and credit overrides.

`node scripts/test-mot-art-absence.cjs`, with the usual browser environment variables below, checks actual bundled San Sebastián/Spain zero-map and zero-sticker labels, truthful clothing guidance, empty image results and an unchanged trip at six widths. It makes no provider request. Zero published flat maps means the literal 50-flat-map sample is unavailable; report the actual map-tee corpus and labelled negative controls instead.

## Browser check

Start the normal Vite server, then set `MOT_TEST_ORIGIN`, `MOT_FCC_SOURCE`, optional `MOT_PLAYWRIGHT_MODULE` and `MOT_EVIDENCE_DIR`:

```powershell
node scripts/test-mot-art-preview.cjs
```

Uses sandboxed Chromium and actual FCC San Sebastián/Barcelona hotel rendition bytes, supplied through explicit local transport fixture URLs. The test uses a real source rendition as its available original, with its actual pixel dimensions/hash. It does not edit image pixels, fake a live CORS deployment, or publish fixture records. The selected original is byte-verified and decoded before any board command. It keeps original bytes, crop, source, credit and rights, makes one atomic placement and preserves the trip's destination/cards.

Checks six widths (1920/1440/1280/768/375/280), overflow, targets, Plex/400/600/type ramp, one visible primary, other-city origin, source-link keyboard access, focus return, Escape after failure, deferred originals, one Add/Undo and personal-package round trip. Fault cases exercise three bounded preview retries and failed-original no-write. A source with only a small rendition can still be added; an actual A5 issue warns below 300 dpi. Unit checks also reject wrong hashes/dimensions/apparel and cancel during decoding before any document/byte registration.

The preview's existing 20-second timer now settles pending fetch, body-read and image-decode work. A decoder that cannot be interrupted releases its bitmap when it eventually finishes; its late result never becomes a preview URL. Normal completion closes the decoded bitmap once and reports the actual loaded rendition dimensions. Cancellation does not start a retry or fetch the original. The original/thumbnail selection rule, three manual retries, Add flow, print sizing and layout are unchanged. Focused checks: `npx vitest run apps/web/src/artwork/art-preview-load.test.ts apps/web/src/artwork/art-preview.test.ts apps/web/src/trip/trip-art-placement.test.ts`.

The targeted browser deadline helper is retained in the task's external evidence bundle. It uses unedited FCC rendition bytes and holds the actual bitmap's completion past the real deadline, then releases it and checks disposal, no late image, successful Retry, deferred original and an unchanged trip. Its before-fix capture remained Loading preview after 22 seconds. Set the same browser/source/evidence variables plus `MOT_SOURCE_ROOT` for the tested checkout. This proves timeout behavior without a new image-size limit or a physical-device claim.

MOT-85 now uses the canonical country registry for city/all-country scope, populated/zero category counts, missing-city/category offers and an explicit country question. Country choice filters the artwork only. A complete public metadata snapshot can be kept as one of at most 12 dated copies; retries and failures never replace it with a partial batch. Restored copies revalidate their origin membership before use. Original/rendition image bytes are not prefetched into that metadata cache. Root style/manifest metadata is separately bounded and schema-validated, so a preloaded app can reopen its known public catalog while offline. This does not provide an offline cold start. Empty collections offer the normal personal-photo picker; image decode/hash precede one atomic private placement and one Undo. No FCC origin is invented for a personal photo.

Catalog reads now settle cancellation even if fetch or JSON decoding ignores abort. A late response body is cancelled, and late JSON is never validated or saved. The existing 20-second root/country deadlines, four country workers, three retries and explicit dated-copy choice are unchanged. `npx vitest run apps/web/src/artwork/catalog-cancellation.test.ts apps/web/src/artwork/catalog.test.ts apps/web/src/artwork/country-art.test.ts apps/web/src/artwork/country-art-integration.test.ts` checks pre-abort, stalled headers/body, deadline, Stop, failed-batch peer cancellation and unchanged complete caches.

The external Art-Catalog-Cancellation-2026-10-30 browser helper holds completion of actual catalog JSON after parsing its real bytes. It checks the real root deadline, Stop, virtual-clock country deadline, Retry and explicit dated-copy fallback without changing production timers. Late completions must not replace either saved copy or the trip. Set `MOT_SOURCE_ROOT`, `MOT_TEST_ORIGIN` and `MOT_EVIDENCE_DIR`; local public image routes read FCC without modifying it. This is preloaded Chromium evidence, not deployed CORS or physical-device certification.

The guide's destination/export scenarios have separate acceptance. None of these builder checks supplies Opus design sign-off. Browser-plugin support was unavailable; sandboxed Playwright was used.
