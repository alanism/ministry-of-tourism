# R9 export polish — 30 October 2026

Builder candidate on private parent `bb0a55a` / sanitized public parent `ed1c198`. Implements R9-1 through R9-5 and R9-6(b/c); R9-6(a)'s print proof mode stays deferred exactly as requested. Opus's R9 design sign-off applies to its reviewed `3128f2b`, not to a new independent review of this patch. Existing task/review dispositions are retained.

## Changes

Failure UI accepts only written class-based copy and known export step labels. Exception messages cannot be passed to that copy function. Failure reassures “Nothing was written. Your board is unchanged.” Cancel names the same actual step and says nothing was downloaded. Diagnostic receipts add an optional fixed step (`collect`, `layout`, `write`, `verify`) and known `decode`/`empty` classes. Both creation and copy/log serialization reproject against the allowlists; arbitrary context and raw error text are dropped. Known page/source decoder failures, empty issues and missing/corrupt saved media are classified at their actual boundary; cancellation preserves its original reason and cleanup. Storage-only keep failures still leave a downloadable, explicitly unkept file.

On narrow cards READY takes its own row; both format labels use their own line, receipts align, and kept-file buttons stay side by side. Active navigation remains visible after changing views or resizing, without scrolling the whole page; the header shortcut has a tooltip and the phone wordmark has a readable minimum width. The same stamp collision is fixed in the supplied design reference with one scoped CSS rule, with exact before/after SHA and untouched scripts/data.

No magazine patterns, trip/schema/command semantics, source/rights policy, artifact format, deadline, worker setting, package scripts, prior tests or assertions change. All 116 prior test files and eleven protected files, including Spark's Almanac and the renderer, are hash-identical. Kept-file restore/remove/download implementation is unchanged. The additive diagnostic fields/classes implement R9's new requirement; they are not a relaxation to pass old tests.

## Reproduce

`npm run check`; `npm run build --workspace apps/web`. Set `MOT_PLAYWRIGHT_MODULE`, `MOT_TEST_ORIGIN`, `MOT_EVIDENCE_DIR`, then run `node scripts/test-mot-export-review-r9.cjs`. It creates labelled QA content, sets the private canary through the actual human UI, injects a page-codec failure, checks written copy and structured private-free diagnostics, retries to actual PDF/ZIP downloads, measures receipt/navigation/kept-action geometry at 1920/768/375/280, and cancels during writing without a late file or board edit. The initial attempt correctly failed when the agent API refused a privacy-scope write; the probe uses the human UI instead. No permission or guard was weakened.

Four initial unit regressions fail (one privacy negative control passes); the browser baseline reproduces the raw error, missing step, hidden tab, split kept buttons and 280px stamp collision. Two additional source/media classification cases fail before their fixes. Final private check: 119 files / 642 tests in 16.60 seconds, all four types. Successful browser runs include four width cases, actual downloaded PDF/ZIP hashes matching receipts, and no relevant console/page errors. Reference stamp collision reproduces at 375/280 and passes after the CSS-only change at 768/375/280. Browser plugin unavailable; sandboxed Playwright Chromium used. Production-preview URLs, final public checks, exact revisions and kanban save are in the evidence README.

No print-proof switch or new mode was added. No physical-device/performance-budget or independent design score is claimed. Prior intermittent catalogue failures are preserved; passing samples do not prove scheduling is fixed. No credentials, model call, deployment or FCC/Writer's Board source edit. Spark and the other chats' R8/release work remain untouched. Revisit empirical failures and unverified boundaries 30 April 2027; no automation.

Evidence: `Design Sprints/Build-Review-R9-Export-Polish-2026-10-30/README.md`; raw `D:/CodexWork/R9-Export-Polish-2026-10-30`.
