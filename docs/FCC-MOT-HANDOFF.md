# San Sebastián FCC-to-MoT handoff

MOT-104 builder result, 30 October 2026. The existing publisher, adapter, picker, save path and Export surface required no product-code change. The [reuse guide](FCC-REUSE-GUIDE.md) documents the complete flow.

San Sebastián (`san-sebastian`, ES, Europe/Madrid) was discovered through the existing destination picker. All eight live FCC articles were opened and compared with the full feed. The selected story, “The hotel should leave appetite for the city”, retains all **1,773 characters**, source URL/hash/revision and a separate traveler note. Source revision: `sha256:5cd355ee489c4e0a79b653ab215ac5f83a5323a24aab331fd5445ece21aecca0`.

The actual Maria Cristina original and Barcelona Vermouth original retain their SHA-256, pixel dimensions, credit and origin on the visible trip. An explicit existing tee choice keeps three apparel originals as apparel. All five saved images and two decoration placements survive durable reload and native export. Rights remain `unknown`, with the original FCC credit; this personal handoff asserts no new usage permission.

| Actual downloaded file | Bytes | SHA-256 |
| --- | ---: | --- |
| `San-Sebastian-FCC-handoff.mot.zip` | 5,713,547 | `53d34b9b0a109cf6d3e0e2ec38d6c0199f2892123d16acbc7749e20903ec6784` |
| `San-Sebastian-FCC-proof.pdf` | 10,112,248 | `fd4048111fa5f9be4264d025d4e8046e801ec97d4f4a2a5e7eff459d765e5e6e` |

Owner copies are delivered in `Design Sprints/Build-FCC-Reuse-Handoff-2026-10-30/artifacts/` in the planning workspace, outside this public source checkout. The media/files are not published to Git or Hosting. Filenames above are durable files, not expired tab URLs. The ZIP contains the native readable JSON, relative manifest asset references, layout and all selected image bytes.

A clean browser context loaded only the app shell, disconnected the network, imported that ZIP through the existing file input, and exported again. Full cards, source text, traveler notes, five byte hashes, credit/origin and placement geometry match by stable ID; only the imported board identity changes. The offline PDF is **byte-identical** to the downloaded PDF. Live flow: 19.866 s; offline flow: 12.030 s. Both have zero runtime errors and POSTs. Desktop/375 px screenshots retain usable downloads and the reopened board.

A separate real IndexedDB check holds commit acknowledgement: no early Saved or successful persistence receipt; release produces the visible board/revision receipt. Aborting acknowledgement returns an error, keeps the editable card and shows recovery. No extra confirmation or audit surface was added.

Reproduce from a running local MoT checkout:

```powershell
$env:MOT_TEST_ORIGIN='http://127.0.0.1:5199'
$env:MOT_EVIDENCE_DIR='<outside-repo output directory>'
$env:MOT_PLAYWRIGHT_MODULE='<installed Playwright module>'
node scripts/test-mot-fcc-handoff.cjs live
node scripts/test-mot-fcc-handoff.cjs offline
```

The first exploratory PDF differed offline because unselected preview-only tee pages were live content. The handoff now uses the existing explicit tee-selection action; no PDF-equality assertion was removed or relaxed. Legacy `test-mot-content-storage.cjs` still fails its obsolete `Cached issue` label lookup on the current UI; it was left unchanged. Current save-state fault proof and the complete live/offline handoff are separate evidence, not a claim that this old helper passed.

This is builder verification, not independent design acceptance. MOT-94's hold and all existing review/release gates remain in place. No FCC files, runtime code, schema, existing assertion, timeout, deployment, model setting or optional Journal adapter was changed. The result does not certify cold offline app startup, physical Safari/iOS or a newly deployed MoT version.
