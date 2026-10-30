# Scripted WP9 browser checks (MOT-117)

`scripts/test-mot-group-planning.cjs` exercises an existing WP9 application through
its real entry routes, commands, proposals, persistence, native package and UI.
The runner is portable; the app being tested need not be this checkout. The
recorded target is committed `5e8d41e`, which uses the owner-approved WP8 stand-ins.
Publishing this runner does not integrate those feature sources into this branch.

Set these environment variables, then run
`node scripts/test-mot-group-planning.cjs`:

- `MOT_APP_REPO`: the app checkout served by Vite. The actual Git HEAD is recorded.
- `MOT_TEST_ORIGIN`: that app's local origin (default `http://127.0.0.1:5217`).
- `MOT_EVIDENCE_DIR`: a new output directory for receipts, screenshots and ZIP.
- `MOT_ART_FIXTURES`: licensed city fixtures described in `MAGAZINE-QA.md`. The
  runner uses one actual original from `san-sebastian-fixture.json`, retaining its
  credit and source. These media are not committed.
- `MOT_PLAYWRIGHT_MODULE`: optional installed Playwright module path. The recorded
  run used the bundled runtime; no browser dependency installation was needed.

Run `npm run check` and the web build in the target checkout as well as the runner
repository. For the frozen WP9 source, first run its existing
`node scripts/build-trip-guidance.ts`. Windows Git checkout conversion can turn
the generated Markdown into CRLF and fail the unchanged byte-parity test. The
generator restores the exact committed LF bytes; do not normalize the assertion
or silently normalize the HTTP response. The initial failed check is retained.
Use an isolated Vite cache directory when sharing installed dependencies with
another checkout, and point workspace package links at the tested checkout.
If shared font packages resolve outside Vite's workspace, allow their exact
`@fontsource` directory in that isolated launch configuration. Do not broaden
access to an entire private repository. The runner requires actual Plex faces
and a clean console; an early functional run with denied font requests does not
qualify as a successful visual check. Product configuration stays unchanged.

The runner checks:

1. All three native guidance disclosures and 13 points are in the initial DOM.
   Enter opens a disclosure without shrinking the lanes. Ordinary Markdown GET
   matches the maintained source; API/package versions agree and guide URL is null.
2. Rename and photo requests route narrowly, with no questions or board writes.
   Early memories do not invoke voting. Agent context excludes the private canary.
3. The **stand-in** four-household, 20-option fixture totals 60; a two-rank response
   totals 9. Duplicate/higher/lower/conflicting revisions, three invalid-rank cases,
   independent stamps, absent/denied attendance, deterministic replay and the
   fairness-first 36-over-43 comparison are checked in the browser. Real WP8
   envelopes, persistence, sender identity and feasibility remain separate work.
4. An existing board accepts only two selected proposal operations, then Undo
   restores its cards. Today UI proposes/applies exactly two delayed activities
   and keeps the confirmed booking, private card and other day; Undo is exact.
5. Memories keeps private cards out, accepts a reaction, checks the page and
   downloads actual ZIP bytes. The archive contains START-HERE.md and matching
   guidance. A fresh preloaded offline profile reopens identical shared cards,
   arrangement and original image bytes/hash. This is not offline cold startup.
6. Deleting that profile's original blob makes the next package action visibly
   fail, re-enables retry, clears the old receipt, starts no download and preserves
   the board. This is a missing-media fault, not an OS download-dialog test.
7. The app fits 1440, 768 and 375 px with actual Plex Sans/Mono/Serif faces loaded,
   no page errors and no console errors or warnings. Live Muse endpoints are
   blocked defensively; any attempted request fails the proof. No provider call,
   credential, booking/payment, deployment, PDF or print mode is part of this run.

The Browser plugin was unavailable; sandboxed Playwright Chromium was used. The
guide check is local HTTP, not a verified deployed guide URL. Ballot calculations
and selective proposal application use the browser's real core modules; there is
no claim that an unbuilt WP8 ballot/reply UI was exercised. Physical iOS/Safari,
real WP8 integration and live Muse public-page/JSON/ZIP entry observations remain
open. Spark review is deferred. Do not mark MOT-117 Complete from this proof alone.
