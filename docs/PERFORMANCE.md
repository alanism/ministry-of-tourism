# MOT-100 performance and cancellation

Measured 30 October 2026, Asia/Bangkok, on the isolated public `mot-content-cards`
checkpoint based on `51c5100` plus this follow-up. **MOT-100 remains In progress:**
the final desktop run includes an 8.105-second uncached art result against the
unchanged four-second limit, and physical iOS/Safari remains unmeasured.

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
or deadline was changed by that investigation; the issue was left unresolved.

### Resolution: bounded catalogue reads (31 October 2026)

In-test measurements recorded **1,813 metadata reads**, with **1.10 s of 1.57 s**
spent in synchronous file reads. The exhaustive catalogue test now reads batches
of at most **16 files asynchronously**, then performs the original schema parsing
and assertions in manifest order. All **1,811 catalogues / 5,203 artworks** remain
covered. Assertions, catalogues, schemas, worker settings and the **5,000 ms**
timeout are unchanged; the other four tests in that file are unchanged.

A temporary slow-filesystem diagnostic reproduced the timeout in **28.10 s**
with serial reads. The bounded reader completed in **3.77 s**, including a larger
requested per-read delay (15 ms versus 3 ms; Windows rounded the serial waits).
Both diagnostics read all 1,813 files. An invalid crop injected into the last
catalogue was rejected; the original bytes were restored before final checks.
Instrumentation and fault injection are outside the committed test.

Unmodified **`npm run check` passes all 866 tests in 155 files plus all four
TypeScript checks in 35.40 s**, without execution partitions or extra flags.
The ordinary baseline also passed on this occasion, consistent with an
intermittent filesystem-latency failure. These observations establish preserved
coverage and improved tolerance of slow reads, not a universal timing guarantee.

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

## Reproduce

Use installed dependencies and a writable external evidence directory. Do not
install another dependency tree or run other heavy jobs during measurement.

```powershell
node scripts/prepare-mot-performance-fixture.mjs <original-qa.zip> <new-12-page.mot.zip>
npm --prefix apps/web run build
npm --prefix apps/web run preview -- --host 127.0.0.1 --port 5199
```

Set `MOT_PLAYWRIGHT_MODULE` if needed, `MOT_EVIDENCE_DIR`, `MOT_PERFORMANCE_INPUT`
to the derived ZIP, and optionally `MOT_TEST_ORIGIN` / `MOT_SOURCE_REVISION`.
Run the following sequentially. Normal PDF timing defaults to three samples per
profile. Its 120-second observation guard permits recording failures; the product
budget stays 60 seconds. Preserve exit 2 and its receipts when a budget is missed.

```powershell
node scripts/test-mot-art-network.cjs
node scripts/test-mot-export-boundaries.cjs
node scripts/test-mot-export-bitmap-cancel.cjs
node scripts/measure-mot-performance-12.cjs
npm run check
```

Source and production-JavaScript hashes, before/after logs, both timing snapshots,
traces, screenshots and actual PDFs are in the local planning evidence
`Design Sprints/Build-Performance-Public-2026-10-30`. Earlier 13-page N=1 evidence
remains historical. Neither these measurements nor a static model review constitute
physical iOS verification, Opus design acceptance or release approval. No deployment,
runtime key, main update or budget change occurred.
