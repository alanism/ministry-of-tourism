# Logo returns to the landing page

The header logo in `TripApp.tsx` now invokes the existing `newBoard` navigation handler and has the accessible label `Return to landing page`. This clears the remembered active selection and returns to `FirstScreen`; saved boards remain available in the landing page's board list. Source base: `900ee85`, with the one-line change in the working tree.

The browser regression first failed against production because clicking the logo selected the Board tab. It now passes against staged and live production at 1440px and 375px: create a trip, save a note, open Keepsakes, activate the logo by mouse or keyboard, see the landing page, reload, reopen the original board, and compare its complete public content. No page or console errors occurred; the new 2:40 demo remains available. Browser plugin not available; Playwright with Chrome was used. Firefox and Safari were not tested.

Build and type checking pass. `npm run check` completes in 55.93 seconds with 1,487 passing tests and the same four immutable legacy video URL/duration assertions failing as before this navigation change. No harness files were modified.

Production version: `5d81936ea76e8d5c`; rollback version: `2944e3f3ed813ed4`; Firebase project/site: `nonhumanintelligence` / `ministryoftourism`. Only the HTML module mapping and a new TripApp module were published; 2,639 existing files and all Hosting configuration remain unchanged. The new module's sole semantic change is the logo click handler and accessible label.

Local regression script, screenshots, manifests and release receipts: `C:/Users/alani/.codex/visualizations/2026/11/04/01a1a6b8-2ff1-77c2-8364-94dc27fbf818/logo-home/`.
