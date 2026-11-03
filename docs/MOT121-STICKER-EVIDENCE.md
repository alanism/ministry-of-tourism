# MOT-121: local sticker reconciliation

Muse Wonder (`muse-wonder-1.0`) authored the focused tests and implementation; Muse Wonder reviewed, corrected integration handling, and ran the checks. Source `3c2182ccdcd7527d8cde6d037b38c5e61d464b0a` follows baseline `5871569`. This is local implementation evidence, not independent/Muse Wonder review or acceptance of A23. Nothing was pushed or deployed.

## Changes and scope

- The generator now honors explicit tag/stamp kinds and roles through the existing normalizer. 152 airport tags appear in Stickers. This changes their content-derived IDs; saved trip documents are not migrated.
- The audit recognizes alternate original URLs only when canonical FCC release paths have identical full SHA-256 and positive safe-integer byte counts. Conflicting duplicate evidence poisons that path. City, crop, role and display/source consistency checks remain. Aliases are added after the source denominator is frozen.
- All 188 previously unmatched journal derivatives now match: 152 tag classifications plus 36 existing Austin/Manila derivatives whose release-proven aliases were missed. Two of those tags also need the alias proof. No original URL, crop, credit or rights was rewritten.
- 5,051 other entries and all 649 apparel entries remain data-identical. The existing pack registry is unchanged. Full regeneration advances the source epoch globally, so only the 152 validated corrections were transferred; those use the actual current 2026-10-29 / 9c36fe186ebe8d38 source snapshot. Old entries retain their original epoch.

## Checks on the pinned candidate

| Check | Result |
|---|---|
| RED before implementation | 20/22 pass; two intended failures |
| New regressions plus unchanged audit tests | 44/44 pass |
| Unchanged npm run check | 902 tests / 162 files, four TypeScript projects; 39.664 s |
| Production build | Pass; 6.022 s |
| Existing artwork verifier and negative controls | Pass; 5,203 entries, 200 cities |
| Generator repeat | Byte-identical; all 152 corrected items reproduce exactly; 209 HTML sources unchanged |
| Full audit repeat | Byte-identical; all 8,507 source IDs and source fields retained; no prior match regressed; 611 frozen metadata/runtime inputs unchanged |
| Browser | Austin 1440×1000 and Manila 375×1000; fresh isolated Chromium contexts, real local FCC image bytes |

Browser flow: choose registered destination → Add FCC art → Stickers 1 → preview → Add → Undo/Redo → reload → Composition. Original bytes are deferred until Add. Persisted asset SHA/byte count, crop, origin, URL, credit and rights agree with the selected source. Reloaded composition settles and renders. Page identity, meaningful content, framework-overlay absence, console health and preview layout passed. No external asset request reached a provider; local routes supplied real source bytes, including the existing local sample feed. Browser plugin was absent, so installed Playwright was used. These are representative desktop/phone-width checks, not physical-device, live availability, exhaustive picker reachability or publication acceptance.

## Coverage and remaining holds

| Inventory | Before | After |
|---|---:|---:|
| Source rows | 8,507 | 8,507 |
| Matched source rows | 5,010 | 5,203 |
| Missing source rows | 2,664 | 2,471 |
| Unresolved source rows | 833 | 833 |
| Extra MoT entries | 193 | 1 |
| Journal derivative matches | 3,228 | 3,416 |
| Unmatched journal derivatives | 188 | 0 |
| Unresolved journal derivatives | 16 | 16 |

Five additional full-source rows gain valid release-alias matches (Austin/Manila café and city ink, Niseko café). The full audit still correctly exits **2**. It does not claim full coverage. Next bounded work: 16 inline original-sheet mappings in New York/Ho Chi Minh City; remaining Manila brush-portrait extra; Osaka/Taipei role dispositions; and 814 unaccounted registry-use issues. The wider 2,471 missing/833 unresolved denominator needs disposition, not a claim that every row requires a new feature.

MOT-121 stays In progress. A23, requested Muse Wonder definition/review gates, R20 findings, existing device/production holds, native JSON/ZIP and PDF closure remain unchanged. MOT-122/127 remain responsible for their broader product acceptance. No harness assertion, configuration, deadline, dependency or release checker was altered.

## Failure record and reproducibility

The first Wonder test draft guessed paths/API shapes and was rejected; the repaired draft needed one result-envelope correction before RED. Its first implementation passed 43/44: plural `stickers` was not accepted by the existing normalizer. Wonder corrected the caller; the normalizer and tests were preserved. The alias lookup was changed to a single indexed pass before application. Integration review caught a global snapshot-ID refresh, compact-format churn and Windows text-decoding damage; those were removed before the final candidate. Exact reviewed source edits and preserved metadata were checked against the baseline Git objects.

An isolated-worktree full check passed 902 tests but encountered duplicate private-class types through its dependency junction. The canonical checkout resolved that environment issue without configuration edits. A concurrent-load repeat ran out of memory; the failure log is retained, and the final unmodified standalone run passed. Browser automation initially raced loading and assumed Add left the picker open; waits were aligned with actual behavior. The external Vite wrapper needed the real installed-font path in its local allowlist; repository configuration stayed unchanged.

Retest these resolved model failure modes at the six-month review (2027-04-30); no recurring job was created. Exact receipts, inputs, failures, commands and screenshots are in `C:\Users\alani\OneDrive\Documents\Vibe Code\Ministry of Tourism\Design Sprints\MOT121-Wonder-Stickers-2026-10-31`. `MOT121-STICKER-EVIDENCE.json` binds artifact hashes and actual model call IDs. Publication digest: `3a14903b2643a0f5571fd46c0e1130117d86cd5ccefc8d2539c0e8598dc72740`.
