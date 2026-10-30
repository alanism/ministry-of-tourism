# Art-rich native ZIP verification

MOT-91 uses the existing ZIP exporter/importer and SHA-256 blob store. Limits are **10 MiB per expanded file** and **50 MiB total**; the exporter refuses a package that cannot pass its importer. Native personal backups keep original bytes, while shared copies filter private content and remove image metadata before recording their exported hashes. Keep the complete archive: readable `trip.json` references assets through `manifest.json` and relative `assets/<id>` paths.

For the current browser check, start the normal local MoT server and use an art-rich native ZIP containing permitted test data:

```powershell
$env:MOT_TEST_ORIGIN='http://127.0.0.1:5199'
$env:MOT_PACKAGE_FIXTURE='<outside-repo native ZIP>'
$env:MOT_EVIDENCE_DIR='<outside-repo output directory>'
$env:MOT_PLAYWRIGHT_MODULE='<installed Playwright module>'
node scripts/test-mot-package-boundaries.cjs
```

The check uses a fresh sandboxed Chromium context. After loading the app shell it disconnects the network and imports the same ZIP twice through the actual file input. Each copy must get a new board identity, retain complete cards/source text/notes, geometry, asset metadata and every stored image hash, and reuse the same durable blob keys. It hashes every registered original, including explicitly kept issue apparel that has no card/decoration placement.

Eight cloned archives exercise path traversal, changed image bytes, an oversized expanded entry, a future manifest version, unknown manifest/readable fields, a missing image and active HTML. Each must show its specific failure while the active Yjs bytes and durable blob keys remain identical. Screenshots check 1440/375 px; runtime errors and POSTs fail the check. Mutated archives stay in the external evidence directory and are never written over the input file or extracted into the filesystem.

Run the existing core regression suites as well:

```sh
npx vitest run packages/core/src/trip/round-trip.test.ts packages/core/src/trip/import-limits.test.ts packages/core/src/trip/asset-boundaries.test.ts packages/core/src/trip/protections.test.ts packages/core/src/trip/phase4.test.ts packages/core/src/trip/acceptance-gaps.test.ts apps/web/src/trip/artifact-privacy.test.ts apps/web/src/trip/trip-media.test.ts
npm run check
npm --prefix apps/web run build
```

The existing decompression tests separately verify aggregate expansion limits and that an oversized entry is not inflated. Browser evidence is for a preloaded app shell, not cold offline installation, physical iOS/Safari or a newly deployed version. A static model review supplements executed checks; it does not execute them or grant design/release approval. The [real city handoff](FCC-MOT-HANDOFF.md) supplies a full-text, five-original fixture and byte-identical offline PDF proof.

On 30 October 2026, the actual requested/reported `muse-spark-1.3-contributor` code review returned **approve**, with no findings (request `chatcmpl-01a18bad-14e7-7753-89ec-4c7c6411f0ab`). It reviewed the supplied package/import/model/schema/media code, existing regressions, new browser probe and callback excerpt. Codex executed the 50 focused tests, 613-test full check, four types, build and 4.402-second browser run; Spark did not execute them. The five-image browser fixture and its article/note/media contents were not sent to the reviewer. Review source hashes and API/evidence receipts are retained with the kanban record.
