# WP4 Codex acceptance — 31 October 2026

Owner-authorized acceptance: Codex replaces the pending Opus sign-off for MOT-89, MOT-102 and MOT-103. Muse Wonder 1.0 authored all product changes, the crop regressions, browser regression modes and navigation updates. This is Codex's assessment using the Council lenses, not a statement by the named designers. Previously Complete MOT-87/88/90/91/92 retain historical acceptance; current synthetic checks supplement it. PDF-only work remains owner-closed. Paired spreads remain as requested.

## Changes and observed failures

- An unrelated pointer-up committed another pointer's drag. The matching-pointer guard now owns begin/move/end/cancel; a real mouse drag with an injected unrelated pointer-up/cancel commits once only on its own release, and Undo restores exact state.
- Empty Redo left pending set at an unchanged revision and silently blocked subsequent drag commits. Pending now follows a successful history operation only. Empty Redo → drag → exact Undo passes.
- Zoom converted a valid non-square crop to a square. It now retains aspect and centre, clamping to source edges. Four new tests failed before implementation; all five new cases and seven existing geometry tests pass afterward.
- Computed style found the DPI label at weight700. One scoped rule sets600; 48 layout/state scans now contain only IBM Plex400/600 in editor text.
- The old reader/apparel helpers opened Keepsakes and expected a magazine immediately. Current Keepsakes opens Memories. Wonder added the explicit Magazine choice; no old assertion/limit was removed.

Declined speculative nonfinite sanitization: no demonstrated entry past the existing schema. One newly generated crop assertion incorrectly expected the old width at absolute zoom1; corrected to the existing documented absolute-zoom contract. Failed observations remain in the local evidence folder.

## Engineering evidence

`npm run check`: 156 files / 871 tests, 28.44s Vitest plus four TypeScript projects; default command passed. Production web build passed. No harness configuration, thresholds or existing assertion were relaxed.

- Reader: Bangkok14, Kyoto14, Lisbon14, sparse San Sebastián11 pages, at1920/1280/768/375/280. All53 pages pass text-fit and ink-protection checks, including106 phone page checks. Removing route knockouts or credit zones is detected in all four cities. Original source/state unchanged after reading and specimen/postcard interactions.
- Composition: 48 spread/width cases at1920/1440/1280/768/375/280; mouse move, aspect resize,45°rotation, crop zoom/pan; touch move/resize/rotate/crop; keyboard lock/unlock;30 mixed actions exactly undo and redo; edited card title visible in both lanes and magazine; injected decode failure recovers without a document write. New pointer and empty-Redo regression modes pass.
- State: fresh synthetic v1 migration preserves original store bytes and private note; future version leaves original bytes untouched; a held IndexedDB write prevents early Saved; quota exhaustion offers native recovery with byte-identical original art; another board remains untouched; no base64 media in localStorage.
- Package: fresh preloaded offline profiles reopen the same ZIP twice, preserve content/layout and media bytes, and deduplicate the blob. Zip-slip, checksum mismatch, oversized entry, future version, unknown manifest/readable fields, missing image and active content all reject atomically. Scope/rights/guest isolation tests remain green.
- Merchandise: live FCC originals for all four cities; six viewport widths; three classified apparel variants; city-only/no-referrer link; no invented price/size/stock. Missing brush and failed colour variants recompose successfully. All200 real rendered FCC shops select their own city. This is read-only routing, not a purchase or stock claim.

## Reference comparison and hard gates

Reviewed saved MOT-89 round2 reference and MOT-Composition plate reference against the running source. Preserved the cream/Plex/ink system, jacket advertisement, dominant specimen, panorama, diagrammed route, portrait-to-tee story, postcard and calm correspondence. Sparse San Sebastián drops absent editorial slots. The production app uses actual trip text, date/source disclosures, a spread selector and layers buttons; it does not reproduce prototype-only controls or fixed sample prose. Longer source material remains in notebook/source pages under the prior owner decision. These are accepted data/interaction differences, not a claim of pixel identity.

G1/G3: canonical sequence and distinct patterns pass existing magazine-r4/r6 tests and four-city page inspection; notebook/source overflow follows preserved paired-spread policy. G2: unique source identities/slots and apparel use pass; intentional panorama/jacket seam segments are one shared picture, not accidental reuse. G4/G10: missing slots drop without placeholder/filler; sparse city passes. G5: embedded Plex400/600 and brand tokens retained; no renderer change. G6: title/credit/origin tests and actual ink checks pass. G7: apparel classification, advertisement and200 city-only routes pass. G8: five-width all-page reading/ink tests pass. G9: excluded by owner's PDF closure, not newly tested.

S1:48 computed-style scans pass after DPI fix. S2:no competing red primaries in composition; action styling remains neutral by design. S3:move/resize/rotate/crop/lock/layers/preview/retry states exercised. S4:page fit at six widths;44px toolbar/action/handle controls and clickable checkbox labels; scaled art/text uses full-size Layers controls as the accessible alternative. S5:source details, retrieved dates and origin/credit retained. S6:held-write and quota proof pass. S7:same-document title edit and exact Undo pass. S8:decode-failure recovery passes; provider/network policy unchanged and covered by existing tests. S9:no new banned claim; low DPI says soft on paper, never print-ready. S10:keyboard selection, lock/unlock, movement, resize, Undo/Redo and Escape remain available with visible focus.

## Design Council scorecard

Each row lists five dimensions in the order from the owner rubrics. Scores are Codex review judgments informed by rendered evidence, not automated measurements or opinions of the named designers.

| Lens | Magazine/merch | Composition |
|---|---|---|
| Andy Allen | Agency19, Tactile19, Outcome19, Warmth18, Restraint18 =93 | Agency19, Tactile18, Outcome19, Warmth18, Restraint18 =92 |
| Ryo Lu | Simple entry18, Shared primitives19, Transparency19, Steering18, Refinement18 =92 | Simple entry18, Shared primitives19, Transparency19, Steering19, Refinement18 =93 |
| GMUNK | Grid19, Type18, Geometry19, Image treatment19, Scale18 =93 | Grid19, Type18, Geometry19, Image treatment18, Scale18 =92 |
| Jayse Hansen | Story19, Focal priority19, Sequence18, Negative space18, Feedback18 =92 | Story19, Focal priority18, Sequence18, Negative space18, Feedback19 =92 |

Evidence and deductions by dimension:

- Allen Agency: specimen/tee choice and exact Undo put the traveler in control; deduction: generated headings remain content-derived. Tactile: postcard/stamp and direct handles have concrete behavior; deduction: no physical iOS haptics/device observation. Outcome: genuine shop navigation and durable ZIP; deduction: no checkout fulfillment tested. Warmth: real FCC ink on cream stock; deduction: sparse issues naturally have fewer illustrations. Restraint: no fabricated fillers or new prompts; deduction: source appendix remains lengthy for long articles.
- Lu Simple entry: clear spread/format choice; deduction: Magazine is one click beyond Memories. Shared primitives: common cards, fonts, buttons and one TripSession; deduction: editor has a specialist canvas. Transparency: explicit credit/date/DPI/source details; deduction: some details require expansion. Steering: crop, specimen and tee selection persist; deduction: automatic page headings are not free text. Refinement: corrected gesture ownership and typography; deduction: small objects are easier from Layers than from the canvas.
- GMUNK Grid: visible6×12 guides and snap geometry; deduction: deliberate art breaks are intentionally irregular. Type: approved Plex weights and reader minimum sizing; deduction: editor overview scales page typography and uses Layers for access. Geometry: tested crop/rotation/resize and route knockout bounds; deduction: source-edge clamping necessarily shifts crop centre. Image treatment: FCC originals, multiplied illustration and honest apparel; deduction: some originals warn below300dpi. Scale: reader five widths and editor six; deduction: phone shows one editor page at a time.
- Hansen Story: each named spread/editor action has a clear purpose; deduction: notebook overflow extends the fixed reference story. Focal priority: dominant specimen/picture and selected-object handles; deduction: dense source prose competes more than fixed prototype prose. Sequence: cover→feature→plate→route→style→correspondence→back remains coherent; deduction: sparse inputs omit unavailable sections. Negative space: calm facing pages and disclosed controls; deduction: sparse editorial pages are unusually quiet. Feedback: named Undo, live draft geometry, honest saved/failure/DPI states; deduction: source loading still depends on network latency.

Supporting Satori assessment (both halves target80): layers [9,9,8,8,8,9,9,8,9,8]=85; performance [9,8,8,8,9,8,8,8,9,9]=84. Evidence respectively: anchored spreads;6-column grid;repeated insets;calm facing pages;Plex ramp;400/600 pairing;dominant images;ordered reading;direct recoverable edits;five/six-width adaptation. Performance evidence:clear purpose;disclosure controls;source-preserving whitespace;varied spread rhythm;selected-object contrast;repeated gaps;minimum reader text;phone page switching;meaningful stamp/circle/line forms;one-break guidance. Deductions are the same observed long-source/sparse-input/overview-scale compromises above.

## Limits and reproduction

Browser plugin unavailable; sandboxed Playwright Chromium used. Touch is emulated, not physical iOS. Legacy migration is synthetic; this run does not reopen a private Taylin journal or claim a new exact b47a0f1 migration proof. Live provider checks cover FCC public content/shop reads only. PDF-only work was neither generated nor reapproved. No outside designer or independent-human verification is claimed.

Use the existing commands in WP4-COMPOSITION-QA.md, now selecting Magazine explicitly. New modes: `node scripts/test-mot-composition.cjs bangkok --pointer-regression` and `--redo-regression`. Local evidence: `Design Sprints/WP4-Wonder-Completion-2026-10-31` beside the canonical kanban. No licensed media fixtures or credentials are committed.

Wonder receipts: composition review chatcmpl-01a18e69-122e-707d-a57f-cfe566b5f0c9; implementation chatcmpl-01a18e6a-875b-769c-a3dc-d9314d21ffab; navigation chatcmpl-01a18e68-7a3b-7244-96d5-a92aaebec449; gesture tests chatcmpl-01a18e6c-57eb-7796-82ef-5fa2933776dc; new-test correction chatcmpl-01a18e6c-94b8-764d-8a88-566a83ac40ba. All returned muse-wonder-1.0.
