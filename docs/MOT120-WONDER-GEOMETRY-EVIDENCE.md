# MOT-120 — Muse Wonder geometry foundation

31 October 2026. Actual `muse-wonder-1.0` supplied the tests, implementation and a new-test typing repair through three recorded calls. Codex orchestrated, reviewed and checked the local result. Tested code: `e3d2e84364ede4a43f3048160cad5828c9ecc5d8`; baseline `f40dc7d01247de32ce2b21c5c79d9807e7b9cd1a`. The owner-approved G1–G6 and actual Astra contract review at `f40dc7d` govern this work.

## Delivered slice

New `packages/core/src/trip/board-geometry.ts` derives card rectangles with approved defaults/bounds, routes asset-only board geometry while leaving magazine placements alone, validates full-rectangle bounds/zero board rotation/integer stacks, and sorts paint order by stack then stable kind/ID using code-unit comparison. Moving an object cannot change that order. Inputs are not mutated; invalid geometry is rejected, never silently clamped or coerced.

This is a pure foundation module, deliberately not exported through the public barrel or wired into runtime UI. No current schema, card/presentation writer, lane comparator, actor guard, persistence store, package format, artwork catalog or existing harness file changed. Schema stays v2. The new module's proposed size/surface inputs do not make them valid schema-v2 command inputs. These helpers are not an authorization boundary; future commands must still perform the approved graph/actor checks.

## Verification

- New tests first ran against an explicit throwing scaffold: 1 passed / 111 failed. The scaffold is retained as evidence, not committed implementation.
- All 112 focused tests pass. Boundary/default/numeric validation, magazine exclusion, card-linked rejection, stable order, comparator laws and frozen inputs are covered.
- Three temporary implementation mutations were caught: one-unit right-edge tolerance; removal of the asset-only card-link check; locale-dependent ID sorting. Original implementation restored byte-for-byte afterward. Mutation logs retained.
- First full run: all 1,014 tests passed, then the unchanged type checker caught unchecked array indexing in the newly written test. Wonder repaired the four known-existing index typings without changing the assertion. Failure and model receipt retained.
- Final unchanged `npm run check`: 1,014 tests / 163 files, including all 902 existing tests, and all four TypeScript projects pass (33.02 seconds). Production build passes (5.676 seconds); existing large-chunk warning retained. No timeout, worker, assertion or harness setting was loosened.

## Remaining and held

MOT-120 is In progress, not complete or independently verified. Persisted fields, schema-v3 migration/refusal recovery, surface routing in consumers, free-board rendering, gestures, duplicate/paste, browser/touch/keyboard evidence and native round trips remain downstream work. The current slice makes no product-UI improvement or physical-device acceptance claim. Other task-definition, privacy/MOT-130, production, device, PDF and harness holds remain unchanged. No wider eligibility/replacement/caption decision was chosen. No push or deployment.

Reproduce the focused check with `node_modules/.bin/vitest.cmd run packages/core/src/trip/board-geometry.test.ts`, then the unchanged `npm run check` and `npm --prefix apps/web run build` on the canonical candidate. Scoped inputs, model responses, failures, mutations and check logs are retained in `Design Sprints/MOT120-Wonder-Geometry-2026-10-31/`; the JSON receipt binds their hashes.
