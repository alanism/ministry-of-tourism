# Homepage demo update — 4 November 2026

Public video: https://ministryoftourism.web.app/assets/mot-final-3segments-2m40-20261104.mp4

Owner-supplied `MoT-final_3segments_2m40.mp4`, copied unchanged: 39,060,146 bytes; 1920 × 1080; H.264/AAC; 160.433008 seconds. SHA-256: `3dc45b234b65a55324eb68cb2f283e490a9600f3865420a044213843977840e0`. The homepage source, fallback link and visible duration now reference this film. Source base: `900ee85`; changes are in the working tree.

Live Hosting version: `2944e3f3ed813ed4`; rollback version: `1fc7e557026d63b9`, site `ministryoftourism`, project `nonhumanintelligence`. This is a surgical update of the current production manifest rather than a replacement with a different local build: an HTML import map routes the original TripApp module to `TripApp-demo-20261104.js`, whose only semantic changes are the two video URLs and duration label. The original runtime, original modules, 2,637 existing files and Hosting configuration are preserved. The new MP4 has a distinct URL because asset responses use immutable caching. A future full source deployment builds the same change from `FirstScreen.tsx` and the new public asset.

Live headless Chrome checks pass at 1440px and 375px: page identity, native keyboard playback, 1080p metadata, seeking to 145 seconds, no initial video download, no overflow, and no page/console errors. The direct MP4 opens the browser's native player; HTTP byte-range requests return 206/video/mp4. The full live video SHA-256 matches the original file.

Build and type checking pass. `npm run check` completes its test phase in 56.28 seconds: 1,487 pass; four fail because immutable assertions in `FirstScreen-video.test.ts` and `sample-media.test.ts` explicitly require the replaced video URL or 2:30 label. Those harness files were not changed. The new browser acceptance check first failed on the original live URL, then passed against staged and live replacements. Firefox and Safari were not tested.

Local deployment receipts, manifest comparisons, browser acceptance script, screenshots, and check logs are in `C:/Users/alani/.codex/visualizations/2026/11/04/01a1a6b8-2ff1-77c2-8364-94dc27fbf818/video-swap/`.
