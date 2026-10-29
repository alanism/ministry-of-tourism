# PERFORMANCE — MOT-100 (Draft, N=1 probe)

> Honest local probe only. Not production CDN, not cold app startup, no quantile / universal-device claims.

## Thresholds (immutable, unchanged)

- Cached city/art view: 2000ms
- First uncached view: 4000ms
- 12-page art-rich PDF: 60000ms
- No budgets changed.

## What was actually measured

- Source: `00a3349` on branch `mot-content-cards`
- Current remote preview is older approved `b657c2b`; these newer results are **not deployed there**.
- Environment: Local production Vite preview, sandboxed headless Chromium
- Host: win32 10.0.26200, Intel(R) Core(TM) i5-8400 CPU @ 2.80GHz, 6 logical CPUs, 25610080256 bytes RAM
- Fixture: city `kyoto`, previously captured public FCC editorial and licensed artwork; QA annotations are fictional. No private trip/user data.
- Original native zip SHA256: `553d1bd047a6f755a352282f5ae6d06f32cbaaee1ad8317b92ee48d135d4c1ff`
- Sample: **13 actual canonical Kyoto pages (not 12)** — conservative larger stress case. Exact 12-page target **not measured**.
- N=1 per profile. No repeated timings.
- Endpoints:
  - firstView: Click Add/FCC art through first visible Preview control, with first thumbnail decode reported separately
  - pdf: Actual public agent exportArtifact PDF receipt plus byte retrieval
- Reproduction: outside-repo measurement script in evidence (not in repo). See evidence bundle.

## Profiles

- `desktop`: 1440x1000, CPU x1 (no added throttling)
- `phone-chromium-emulation`: Emulated phone on Windows desktop Chrome — 393x852 DPR3 touch, CPU 4x slowdown, latency 150ms, 1.6Mbps down / 750kbps up (209715.2 / 96000 Bps in harness). Actual iOS/Safari NOT tested — not available on host.

## Results (N=1 each)

| Profile | First grid ms | First image decoded ms | Cached grid ms | Cached decoded ms | PDF ms (13pp) | PDF bytes | PDF SHA256 |
|---|---|---|---|---|---|---|---|
| desktop | 928 | 936 | 158 | 164 | 10443.70000000298 | 19757488 | 6cb3291d5cbb76e24bd12b0def5b716e79e9f4290d7e7ddf5ab3dae5cbcdaf46 |
| phone-chromium-emulation | 2076 | 2153 | 996 | 1216 | 56760.29999999702 | 19757488 | 6cb3291d5cbb76e24bd12b0def5b716e79e9f4290d7e7ddf5ab3dae5cbcdaf46 |

Notes:
- First image decoded: 936ms (desktop) and 2153ms (phone emulation).
- Cached decoded: 164ms (desktop) and 1216ms (phone emulation).
- All views `imageDecoded: true`.
- PDF 13 pages within 60s: `true` for both profiles (`exact12PageTarget: false`, `largerDocumentWithin60s: true`).
- Phone-emulation PDF 56760.3ms (~56.76s) is under 60s with narrow margin (~3.24s). No speculative optimization. No false failure claimed.
- Desktop PDF 10443.7ms for same 13-page / 19757488-byte artifact.

## Exclusions / non-results

- Initial Vite dev-server throttled-startup test timed out before measured flow and is **excluded, not a performance result**.
- Cold app startup: not measured.
- Physical iOS / Safari: not tested.
- Existing progress/cancel/recovery UI was not exercised by this timing probe; no percentage claim.
- S1–S10 / Opus / MOT-94 remain separate.

## Status

MOT-100 stays **In progress** pending real iOS/Safari, the exact 12-page case and cancellation/recovery boundary proof. N=1 limits confidence; repeatability is not established.


Drafted by the actual Meta model `muse-spark-1.3-contributor`, request `chatcmpl-01a1874f-8618-75b3-bb0e-2599bd280a15`, from measurements collected by Codex. Codex reviewed this draft; the model did not execute the benchmark. Reproduction: `scripts/measure-mot-performance.cjs` with a caller-supplied licensed native ZIP and a local production preview.
