# MOT-100 performance and cancellation

Measured 30 October 2026, Asia/Bangkok, on the isolated public `mot-content-cards`
checkpoint based on `51c5100` plus this follow-up. **MOT-100 remains In progress:**
the final desktop run includes an 8.105-second uncached art result against the
unchanged four-second limit, and physical iOS/Safari remains unmeasured.

## App-only continuation · 31 October 2026

The current workflow measures app city/art views without entering Export or generating an artifact. The original native fixture is reused unchanged; no fixture derivation or PDF benchmark runs. Legacy measurements below remain historical evidence.

Visible thumbnails now show loading. A visible thumbnail that has not completed in 20 seconds changes to a recoverable unavailable message, matching the existing full-preview wait. Selecting it opens that preview’s Retry flow. Close/Escape remain usable, and neither timeout nor retry inserts art. Offscreen lazy thumbnails start their wait when visible; completion, source changes and unmount clear it. No percentage or synthetic progress is shown.

| App surface / profile | Samples | First usable view, ms | Cached usable view, ms | Observation |
|---|---:|---|---|---|
| Art / desktop | 3 fresh browser processes | 979.1 / 950.5 / 946.0 | 237.4 / 192.0 / 180.5 | All within 4000/2000 ms |
| Art / phone Chromium emulation | 3 fresh browser processes | 2811.6 / 2974.7 / 2985.5 | **2171.9** / 1595.9 / 1721.1 | First cached sample fails the 2000 ms budget |
| Art / phone diagnostic repeat | 3 fresh browser processes | 2865.7 / 2867.7 / 2692.1 | 1557.3 / 1576.4 / 1587.9 | Passing repeat does not replace the failed sample |
| City / desktop | 1 | 385.5 | 69.0 | Real published Kyoto items visible |
| City / phone Chromium emulation | 1 | 834.0 | 224.9 | Real published Kyoto items visible |

The failed cached phone view spent 2141.9 ms before its grid was available; it had no newly observed thumbnail request. Host CPU busy time was 93.0% over the first/cached probe window (including screenshot/diagnostic work). This locates the delay before image decode but does not establish a cause. The diagnostic repeat records public local JSON timing and long tasks, along with the existing safe image/proxy observer. Its cached views re-requested public metadata; no speculative cache/freshness/profile changes were made. All new normal samples have zero page/console/provider errors and exact native board reads before/after.

Profiles retain desktop1440×1000/DPR1/CPU×1 and phone393×852/DPR3/touch/CPU×4/150 ms latency/209715.2 B/s down/96000 B/s up. App load and exact native fixture import precede throttling; first art ends after the first thumbnail decodes, while city ends when actual public items are usable. Browser/OS/proxy caches are not reset beyond the existing Chrome first/cached cache setting. These are small local measurements, not percentiles, cold startup, physical iOS/Safari, independent review or proof of a causal speedup.

**MOT-100 stays In progress.** The new2171.9 ms miss, older8105.1/8132.8 ms failures and unmeasured physical iOS/Safari remain explicit. The 4000/2000 ms budgets, prior tests and legacy scripts are unchanged. PDF work remains owner-closed.

The new driver rejects incomplete runs, missing usable content, failed/undecoded images, non-finite times and every over-budget sample; exit2 means a measurement or runtime check failed. A quick grid or fast unavailable response cannot count as passing. `scripts/test-mot-art-loading.cjs` exercises held image loading, timeout, offscreen lazy behavior, retry, Close/Escape and exact board preservation at1440/375 using a virtual clock for20-second fault waits.

A first ordinary check hit two existing response-ledger CLI five-second timeouts (771pass/2fail;95.50s) during a busy-host period. Feature work stopped for investigation; those four CLI tests passed alone in4.55s. A sequential unchanged ordinary check then passed **773tests/135files in41.08s**, all four TypeScript projects, and a separate build passed in7.03s. No worker/deadline/config change was made; the failed run is retained. Current app-only receipts, fault screenshots and source audit are in the canonical planning folder `Design Sprints/Build-MOT-100-App-Only-2026-10-31`.

## Unchanged budgets and preserved ccb4f5d results

First decoded art: **4,000 ms**. Cached decoded art: **2,000 ms**.
Exactly 12-page, art-rich PDF: **60,000 ms**. No limit was revised.

| Profile | First decoded art, ms | Cached decoded art, ms | Three 12-page PDFs, seconds | Result |
|---|---:|---:|---|---|
| desktop | 8105.1 | 169.3 | 8.727 / 7.807 / 7.889 | First art over 4 s |
| phone-chromium-emulation | 2199.7 | 1253.3 | 40.451 / 36.583 / 36.424 | Measured samples within limits |

The desktop grid was ready at **912.4 ms**, but its first image decoded at
**8,105.1 ms**. This failed sample is retained: the final benchmark correctly exits
**2** with `allWithinBudget:false`. Three separate diagnostic desktop contexts
subsequently decoded the same 480-pixel WebP in **911.5–969.1 ms**. Their recorded
image response durations were **249–274 ms**, HTTP 200. Those traces do not explain
the earlier stall or replace its failure; the original run did not capture resource
timing. No speculative source optimization or hidden reclassification was made.

PDF timing has three samples per profile; each first/cached view has one sample.
These are local small samples, not reliability percentiles or universal device
claims. A prior port-only snapshot also passed all its measured budgets; it remains
separate from this final code snapshot. No causal speedup is claimed between runs.
All six final PDFs contain exactly **12 page objects**, **19,618,892 bytes**, and
SHA-256 `d8a967c6aa62970ae0a1973721b0a1887665ffd88f73fbcf4308f44816293669`.

## Environment and measured endpoints

- Windows 10.0.26200; Intel Core i5-8400 at 2.80 GHz; six logical CPUs;
  25,610,080,256 bytes RAM; sandboxed Chromium 151.0.7922.34.
- Local production Vite preview at `http://127.0.0.1:5199/?view=trip`.
  Browser plugin unavailable; the installed Playwright fallback was used.
- Desktop 1440×1000, DPR 1, CPU ×1. Phone Chromium emulation 393×852,
  DPR 3, touch, CPU ×4, 150 ms latency, 209,715.2 B/s down / 96,000 B/s up.
- App load and native-package import precede throttling. Art timing starts before
  Add → FCC art and ends after the first thumbnail decodes; grid timing is separate.
  Cached view reopens the same sheet. Cold app startup is not measured.
- PDF timing starts before Export PDF / Export again and ends after the ready
  receipt and real bytes are readable. Cover preparation before that click and a
  second checksum/download afterward are outside the interval. Actual progress
  events and receipts are retained. No CPU-heavy checks ran alongside timing.

## Portable fixture and cancellation proof

`prepare-mot-performance-fixture.mjs` derives a new shared QA ZIP without editing
its input. It verifies three actual FCC garments and makes two portrait placements
private in the derived copy, yielding exactly 12 canonical pages with 13 distinct
images. All seven source cards and citations stay unchanged; no generated page is
removed. Licensed media and QA ZIPs are excluded from this public source commit.

Input ZIP SHA-256:
`553d1bd047a6f755a352282f5ae6d06f32cbaaee1ad8317b92ee48d135d4c1ff`.
Derived ZIP: **4,503,091 bytes**, SHA-256
`1f98f55e2bc38d8166934de7cd21c72f8c287144afedfd43671d030137ef24b5`.
Reuse one derived ZIP across comparisons; regeneration timestamps can change hashes.

The old public checkpoint still awaited PDF-page image decoding after cancellation.
Its imported regression failed before the narrow port from committed `220928d`.
Two further failing tests covered cancellation during image initialization and a
stalled source-bitmap decode. The final implementation settles those waits, clears
the page image and URL, closes late bitmaps exactly once, and preserves the trip.
This is an image-decoding boundary fix, not a claim that every asynchronous storage
or media operation is universally interruptible. No export layout or MOT-94 policy
changed.

The final production boundary test holds **desktop only** for **61,006.8 ms**.
Real page-count progress and Cancel remain visible; no percentage is invented.
Cancellation settles in **29.5 ms**. The phone CPU ×4 correctness case cancels after
a short stall in **78.9 ms**; it is not a second past-60-second proof. Both reject
late results, show no late file, and recover from cancellation and an independent
image error via actual verified artifacts. These faults are excluded from normal
performance samples.

The additional native source-bitmap browser test cancels in **44.7 ms desktop /
85.5 ms phone emulation**. It releases a real late bitmap, verifies exactly one
close, no late or kept file, unchanged trip, and successful 12-page PDF recovery.
All successful browser flows record zero page errors. The three focused unit cases,
all **589 tests in 99 files**, four TypeScript projects and production build pass;
the final default suite took **11.21 s**, build **3.01 s**. Existing five-second test
deadlines and all other constraints remain unchanged.

## Catalogue timeout investigation

A read-only standalone probe validates all **1,811 catalogues / 5,203 artworks /
10,438,533 bytes** using the existing schemas. Three runs took **1.17–2.14 s**;
about 80% of that wall time was in file reads, including filesystem/scheduling
cost. Schema validation took **0.16–0.32 s**. Six concurrent probes took
**1.76–1.82 s** each and did not reproduce the intermittent five-second test failure.
A default full check also passed all 586 pre-port tests in 14.80 s. A preload
attempt did not attach to Vitest workers, so it produced no in-test I/O telemetry
and is not treated as evidence about that failure's cause. OS/CDN caches and other
system activity were not controlled. No validator, fixture, test, worker setting
or deadline was changed to force a pass; the intermittent runner issue remains
unresolved. Empirical retry date: 30 April 2027; no automation was scheduled.

## First-art network diagnosis (30 October follow-up)

A new eight-process desktop probe reproduced **8,132.8 ms**, including a
**7,678.139 ms** thumbnail request. Chrome reported **7,219.172 ms in proxy
resolution**, before DNS, connection and transfer. Its first grid was ready at
931.4 ms; no long-task entries were recorded during the view, and measured host CPU
busy time was 11.3%. The other seven fresh-browser views took 753.3–952.7 ms,
with proxy phases of 3.462–3.790 ms. OS/CDN/proxy caches and other system activity
were not reset or controlled; these are small observations, not percentiles.

[Chrome's protocol definition](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Network.pdl)
defines `proxyStart` / `proxyEnd` as proxy-resolution boundaries in milliseconds
relative to request time. This identifies the long phase in the **new reproduction**.
The original 8,105.1 ms sample lacks a network trace, so its cause cannot be proven
from the old data. Both failed samples remain failures against 4,000 ms. No proxy
settings or reference profile was changed, and no proxy duration is subtracted.

The benchmark now records `firstImageRequests` separately for each first/cached
view: request duration, proxy, DNS, connection, TLS, header-wait, encoded bytes and
reported cache flags. This observer issues no requests. Start/end timing, fixture,
PDF samples, existing assertions and 4/2/60-second limits stay the same. All 14
application JavaScript bundles are byte-identical to the prior measured build.
TLS is part of connection time; do not sum overlapping phases. Missing phases are
`null`. An empty request list means no new request was observed for that view; it
does not claim a particular cache source or reuse the first view's network timing.
Redirected requests retain total duration but suppress unsupported per-hop phases.

Only FCC HTTPS image requests are observed. Output drops query strings, fragments,
headers and cookies, refuses credentialed/non-FCC URLs, and omits its internal
query-sensitive identity digest. A RED/GREEN replay of the actual slow trace plus
view-isolation, missing-phase, redirect, privacy and distinct-query identity checks
is available as `node scripts/test-mot-art-network.cjs`. The observer is disposed
before the PDF timing samples.

The final instrumented rerun recorded desktop first/cached **896.4 / 144.8 ms**
and phone emulation **2,282.5 / 1,229.7 ms**. Its three desktop PDFs took
**8.718 / 7.761 / 7.863 s**, and phone PDFs **40.856 / 35.530 / 35.972 s**;
all six retained the exact 12-page byte count and checksum above. That run exits 0.
It validates the observer and current samples; it does not erase either recorded
four-second failure, establish a speedup, reset OS/proxy caches or satisfy physical
iOS/Safari acceptance. MOT-100 remains In progress. Actual Meta Spark static review
approved the observer/report with no findings; it did not execute the measurements.

## Reproduce the current app-only scope

Use installed dependencies, the original licensed native ZIP plus its existing `.json` checksum manifest, and an external evidence directory. Build/check and measurements run sequentially so they do not compete with each other.

```powershell
npm run check
npm --prefix apps/web run build
npm --prefix apps/web run preview -- --host 127.0.0.1 --port 5223
```

Set `MOT_PLAYWRIGHT_MODULE` when using the bundled runtime, `MOT_TEST_ORIGIN`, `MOT_EVIDENCE_DIR`, and `MOT_PERFORMANCE_INPUT` to the **existing** native ZIP. `MOT_PERFORMANCE_SAMPLES` defaults to1 and accepts1–5; use3 to repeat a surface in three fresh browser processes. Use a separate evidence directory for each invocation and retain exit2/failed receipts.

```powershell
node scripts/test-mot-art-network.cjs
node scripts/test-mot-app-performance.cjs
node scripts/test-mot-art-loading.cjs
node scripts/measure-mot-app-performance.cjs desktop art
node scripts/measure-mot-app-performance.cjs phone-chromium-emulation art
node scripts/measure-mot-app-performance.cjs desktop city
node scripts/measure-mot-app-performance.cjs phone-chromium-emulation city
```

The legacy fixture generator, combined export measurements and export boundary scripts are retained as historical source; they are outside the owner-closed current scope. New runs use the app-only commands above. Independent review, actual iOS/Safari reference-device results and release approval remain separate.
