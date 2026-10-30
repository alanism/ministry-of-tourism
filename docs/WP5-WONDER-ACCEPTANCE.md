# WP5 acceptance — 31 October 2026

## Scope and authorship

Owner authorized Engineering Council lenses, Muse Wonder implementation, Codex acceptance, merge and production deployment. WP5 contains MOT-93–97. MOT-94 was the sole unfinished card. MOT-93 remains administratively owner-closed: no new PDF generation, proof, benchmark, PDF-only implementation or independent PDF acceptance was performed. MOT-95 remains accepted for the local runtime only; the production key, authenticated ingress, spending and retention restrictions are not waived. MOT-96's hosting mapping and MOT-97's journal adapter are preserved.

Council lenses: Carmack (real bytes, deterministic commit/cancellation), Carlini (allowlisted diagnostics and private-content boundaries), Schaad (state clarity, readable responsive controls), Tan (test-first and exact release evidence). Codex reviewed generated changes and ran acceptance; it does not claim an independent Opus review.

Actual implementation model: `muse-wonder-1.0` through Meta's API. Tool-free prompts contain relevant source only, never credentials. Exact generated replacements were reviewed and applied after RED. Request receipts and full responses are retained in the local evidence directory.

## Reproduction and changes

The original public main exposed injected private error text in the ZIP failure UI. Its diagnostic omitted the failure step, cancellation omitted the stopped step, narrow receipt stamps overlapped filename space, and phone kept-file actions split across rows. Baseline browser results and failing tests were saved before implementation.

ZIP errors now use safe class-specific recovery copy; diagnostic step is an optional fixed allowlist projected again at serialization. Missing and corrupt selected images receive unavailable/invalid_input classes. Cancellation and browser-storage fallback retain their actual step, with no raw message or private text. No ready/download URL appears before verified bytes; cancelled late results cannot create an advertised artifact. Ready download and durable browser storage remain distinct facts. Narrow cards reserve space above the receipt for the stamp, metadata aligns, and kept actions share a row. Header responsiveness preserves a legible brand and visible active Export tab; the shortcut has an accessible name and tooltip.

Codex rejected Wonder's first inherited-property step check and an unnecessary tablet single-column change; Wonder regenerated both. A second visual pass caught desktop header compression too. No existing assertion, timeout, harness configuration, type rule, package dependency or PDF-specific branch was changed.

## Verification

- Tests added first: initial RED showed missing step/class behavior and absent helper; additional actual missing-image/checksum cases also failed before implementation.
- 12 new tests cover diagnostic allowlisting, prototype-key rejection, safe feedback, actual ZIP cancellation/missing-image/checksum/persistence outcomes. Full suite: 883 tests, 159 files, four TypeScript projects.
- Browser: actual fictional Bangkok package import, human export/download, size and SHA-256 identity, agent retrieval without iframe, reload restoration, offline ZIP export, unchanged board.
- Adversarial browser: injected raw/private error rejected by UI and receipts, retry, paused read-back cancellation with no early/late Download, quota failure with a valid tab-only download, unchanged board. Downloaded quota ZIP contains the shared canary and excludes private title/body canaries.
- Responsive checks: 1920, 1440, 768, 375 and 280 pixels; filename/stamp geometry, same-row kept actions, readable active navigation and brand. Screenshots reviewed against the existing Export reference. This accepts the shared/ZIP surface; no new PDF sign-off is implied.
- All browser tests use sandboxed Chromium, not physical iOS/Safari. Injected faults are explicit fixtures, not claims of real provider/network outages.

## Evidence

Local directory: `Design Sprints/WP5-Wonder-Completion-2026-10-31` beside the canonical kanban. Includes prompts/model receipts, RED/GREEN logs, byte-verified ZIP files, privacy checks, screenshots, adversarial JSON, release receipt, served-asset hashes and final kanban verification. Final source/release identifiers are recorded there and on the board after deployment.

## Muse Wonder receipts

- `chatcmpl-01a18e81-7eb2-7750-8ed2-a8bee423e969`: 94.88 s, 12599 input / 12331 completion tokens, stop.
- `chatcmpl-01a18e83-a9ac-70c9-ad48-143ecd60f3c1`: 99.55 s, 9387 input / 13005 completion tokens, stop.
- `chatcmpl-01a18e86-6938-7392-8617-967368597c73`: 36.56 s, 26189 input / 3450 completion tokens, stop.
- `chatcmpl-01a18e87-b236-738b-94f9-b22febf7dda4`: 39.59 s, 1305 input / 3936 completion tokens, stop.
