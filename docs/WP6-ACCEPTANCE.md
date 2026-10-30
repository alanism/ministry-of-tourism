# WP6 verification and release — 31 October 2026

The owner requested WP6 completion using Engineering Council lenses, Muse Wonder implementation and Codex acceptance, and explicitly authorized main merge and Firebase deployment. The owner expanded acceptance to WP7–WP9 and will run real iPhone/iPad Safari checks in parallel. Device results remain pending; they do not block engineering/deployment by the latest owner direction. Full physical-device acceptance is not claimed. PDF work remains owner-closed. Production Muse remains manual-only.

## Changes and review

Muse Wonder (`muse-wonder-1.0`) authored an app-only real-origin runner, app-only performance tools, bounded thumbnail loading/recovery, an opt-in metadata session cache and a readable scrollable group-summary table. Codex reviewed exact generated replacements, ran RED before implementation, inspected the browser and rejected an overly broad catalog cache. Jeff Dean's latency measurement lens identified repeated index/manifest fetch cost; Carmack's lens required actual bytes/canvas/reload; Tan's lens bound source and evidence; Schaad's lens caught crushed phone table text; Hashimoto's lens guided preview rollback.

The existing origin/performance scripts include PDF work and are retained unchanged, not invoked for new evidence. The new origin runner checks actual anonymous FCC feed, manifest and image fetches, canvas non-taint, exact original-byte UI import and durable reload. Its synthetic no-CORS fetch/canvas failures and positive control pass. Dev and Firebase device preview runs pass.

Thumbnail progress appears immediately; visible lazy images have a bounded20-second wait and existing retry/Close/Escape recovery. Only packaged index/manifest reads opt into a memory-only five-minute/32-entry cache, keyed by URL, schema and fetcher identity. Country catalogs still refresh; retry bypass invalidates prior metadata; expiry, negative clock movement, malformed data, cancellation and mutation isolation are tested. Default readCatalog remains uncached.

## Evidence and limits

Full check after cache fix:896 tests,161 files and four TypeScript projects pass; production build passes. New test failures and later GREEN logs retained. Shared-copy privacy mutation is killed by the unchanged suite; package.ts restored byte-for-byte and original test passes. Existing real WP8 and native WP9 browser checks pass: response exchange/tally/feasibility/fairness/Apply/Undo, persistence, private-safe native packages, memories/adaptation and recovery. Root and art-preview checks pass; the older stand-in WP9 runner fails on its removed planning-standins module and is explicitly not reported passing. The native runner is the current real implementation proof.

Performance uses the existing fictional native fixture unchanged (4503091 bytes, SHA2561f98f55e2bc38d8166934de7cd21c72f8c287144afedfd43671d030137ef24b5). No PDF generated. Desktop and Chromium phone profiles retain original throttling and4s/2s budgets. Baseline phone cached misses2123/2102.1ms remain archived. Fixed phone N3 first3001.5/3036.2/2761.3ms, cached1189.8/1170.5/1143.5ms all pass. Fixed desktop N3 passes. City desktop/phone checks pass. A run interrupted by concurrent deployment rebuild had a404 before measurement and is retained separately; stable-build runs determine timing. CPU profiling did not justify speculative JS optimization.

These are controlled app-view measurements after preload, not cold-start or physical Safari results. The owner retains physical iPhone/iPad checks. Existing performance failures are historical observations, not erased by current fixes. No fresh paid proposal/runtime claim is made.

## Deployment and rollback

Project nonhumanintelligence, target mot, existing site ministryoftourism only. Device preview: https://ministryoftourism--wp6-device-check-9l6gfhp2.web.app (d23b163 initially). Rollback rehearsal channel wp6-rollback-check was seeded from current live WP5, advanced to candidate, rolled back to WP5 and advanced again; Firebase CLI success receipts retained. Never rolled back the production channel. FCC and Writer's Board receive no writes/deployments.

The immutable release checker is retained; it exposes outstanding board acceptance/old private-history revision references rather than inventing ancestry. Current-source reacceptance records must cite actually verified public commits. Physical-device acceptance remains pending. Owner explicitly authorized the guide URL test migration; the verified production URL is now activated. JSON-only discovery retains its no-fictitious-embedded-file guard while checking the public URL separately.

Evidence is under `Design Sprints/WP6-Wonder-Completion-2026-10-31` beside the canonical kanban: model prompts/receipts, original and fixed performance JSON, source bindings, RED/GREEN logs, browser screenshots, privacy mutation, external-site snapshots, preview/rollback/deployment receipts and gate audits. Final release IDs are appended to that evidence and kanban after verification.
