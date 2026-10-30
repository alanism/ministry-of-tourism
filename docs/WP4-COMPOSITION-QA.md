# Current acceptance

On31October2026 the owner reassigned WP4 acceptance to Codex. See [WP4-WONDER-ACCEPTANCE.md](WP4-WONDER-ACCEPTANCE.md) for current results; pending Opus statements below describe the historical30October run. PDF-only work stays closed.

# WP4 composition and portable state

The shared reader keeps the existing paired spreads. Feature overflow belongs in
the notebook; FCC title recovery affects ingestion and legacy display without
rewriting saved cards. Route labels have complete paper knockouts above both the
connectors and river, with short final lines balanced. Cover/apparel credits have
their own paper zone and align with each card's text column. Phone reflow grows
these zones with the text and moves the credit and its paper together.

Run `npm run check` and `npm --prefix apps/web run build`. Start a fresh local Vite
server with `npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5199`.
The Browser plugin was unavailable for the recorded run; sandboxed Playwright
Chromium was used. Physical iOS and independent Opus design scoring remain open.
PDF-only work is owner-closed and excluded from this workflow.

Use `MOT_TEST_ORIGIN`, `MOT_EVIDENCE_DIR`, `MOT_ART_FIXTURES` and, if needed,
`MOT_PLAYWRIGHT_MODULE`. Supply the licensed city fixtures described in
`MAGAZINE-QA.md`; do not commit those media files. Choose a distinct evidence
directory for each probe. Existing test assertions, limits and fixtures remain
unchanged.

- `node scripts/test-mot-wp4-reader.cjs <city>`: Bangkok, Kyoto, Lisbon and sparse
  San Sebastián; real editorial image bytes with explicit fixture roles, current
  published apparel metadata/originals, five widths, all-page text fit, source
  preservation and full spread captures. The additional ink guard measures actual
  SVG text/path geometry and checks that paper covers intersecting route strokes
  and the credit bounds. Removing either protection must fail its negative control.
  A sparse unillustrated cover requires no invented credit or empty panel.
- `node scripts/test-mot-composition.cjs bangkok`: mouse/touch manipulation,
  snapping, lock refusal, keyboard unlock and 30 mixed actions with exact Undo/Redo.
  Its unchanged legacy transport supplies explicit editorial roles; this is not
  upstream classification or physical-device proof.
- `node scripts/test-mot-composition.cjs bangkok --card`: a card-title edit appears
  in lanes and the magazine through the same trip.
- `node scripts/test-mot-wp4-state.cjs`: fictional v1/future-version stores,
  preserved original bytes, a real held IndexedDB transaction preventing early
  Saved, zero-available-quota injection, RAM image recovery in a native ZIP,
  another board untouched and no image data URLs in localStorage. The actual
  selected original's bytes, dimensions and credit are retained. This verifies
  synthetic migration; it does not newly validate a private Taylin journal.
- `node scripts/test-mot-package-boundaries.cjs`: set `MOT_PACKAGE_FIXTURE` to an
  art-rich native ZIP. Two clean preloaded offline imports retain full content,
  layout, provenance and durable hashes; eight malformed archives reject atomically.
- `node scripts/test-mot-apparel-live.cjs`: actual city variants, responsive
  merchandise and city-only/no-referrer shop link. Leave `MOT_TEE_PDF` unset.

Run storage faults in a fresh context without editing source during the probe.
An early run after HMR reported a missing ephemeral image; the same probe passes
after a clean server start. That failed observation is retained, not a production
storage fix or guarantee about development-time hot reload. Agents use default
card scope and inherited placement scope; the existing permission guard forbids
them from changing visibility. No permission rule was relaxed for the probe.

The recorded WP4 engineering checks do not award design scores or mark a builder's
own work Verified. Five previously Complete cards retain their status. MOT-89,
MOT-102 and MOT-103 retain Implemented pending Opus. The owner chose to keep paired
spreads and defer consolidation of sparse/repeated sections to Opus. Catalogue
alias relocation remains an upstream coordination note. MOT-94 and release holds
are outside this change.
