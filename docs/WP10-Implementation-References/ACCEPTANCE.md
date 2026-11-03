# Acceptance coverage and evidence — MOT-129/132

This is a **proposed verification contract**, not an edit to the harness and not a feature pass. Read [review scope](README.md). R20-15/16 apply. Existing task status, device evidence, production authorization and PDF closure remain intact.

## Two observed planning gaps

1. The board's current `isReady` predicate checks status/dependencies/build blockers, not `definitionReview.status`. A task can therefore look ready while its required review is pending. The review adds explicit build blockers to MOT-119–129; it does not rewrite the board's JS or fabricate an Muse Wonder approval. Copied implementation briefs must include the gate/reference.
2. `scripts/check-mot-release.cjs:34` checks explicit criteria A01–A14 (A01–A13 in manual-only mode). It also checks every mandatory card's status, evidence form, blockers, findings and ancestry; those protections remain meaningful. It does **not** enumerate the new A21–A27 coverage. Do not claim it verifies those criteria merely because the new cards are mandatory.

MOT-132 should propose an owner-reviewed contract that validates required criterion IDs and feeding tasks, missing/orphan criteria, actual evidence references, exact candidate/version scope, unresolved findings/decisions, physical devices and allowed scope exclusions. Also reconcile existing A15–A20 treatment without reopening PDF-only work. Do not create a second release card; preserve MOT-101 and existing manual-only hosted-Muse exception. Hosted-Muse optionality must not excuse shared rooms or owner launch journeys.

Because the harness is owner-controlled, implement no new checker behavior, assertion, worker or timeout changes merely to close this finding. Prepare the intended owner-approved change and its negative controls; retain the current checker as-is until authorized. Existing stale WP9 null-guide-URL assertion remains a recorded separate contract issue from the earlier candidate work, not permission to rewrite tests here.

## Feature-to-probe map

| Check / cards | Must fail before implementation | Required real positive proof | Evidence identity |
|---|---|---|---|
| A21 / 119 | Missing export; nested SVG/CSS network reference; private canary; cancelled/oversize output advertised ready | Download actual magazine HTML; moved `file://` fresh-context offline reopen; every page/media/credit compared; actual Safari file-open later | Source, frozen trip revision/scope, renderer/version, selected assets and output hash/bytes |
| A22 / 120, 131 | Cancelled drag commits; paste lands on switched board; duplicate IDs; reload loses geometry | Pointer, keyboard and touch arranging; one-step Undo; lane/freeform/Today/reader consistency; JSON/ZIP round-trip | Source/schema, fixture document and media hashes, before/after commands, device/browser |
| A23 / 121, 122 | Eligible identity on an unloaded shard absent from search; duplicate rendition inflated as design; wrong-city late Add | Exhaustive inventory-to-discovery set reconciliation plus real representative Add/Undo/reopen; existing performance profiles | Catalog snapshot/digest, per-operation eligibility counts/reasons, query/page enumeration, original bytes |
| A24 / 123, 124 | Positional mislabeled IRV; stale method current consent; forged/duplicate/conflicted reply counted | Independent arithmetic oracle, lifecycle checks and unassisted organizer/household journey; portable route works without rooms | Approved method/version/weights, proposal/round IDs, resolved response revision/hash and provenance |
| A25 / 125, 126, 130 | Direct-client forged UID/role/household; private serialization; revoked queued write/media read; conflicting edit hidden | Emulator rule/service negative tests plus three independent clients, server acknowledgements, disconnection/replay/Undo/recovery | Auth/rules/schema/transport versions, synthetic identities/roles, operation IDs and final state digests |
| A26 / 127 | Unsupported variant link generated; flat art shown as garment; token/referrer leak | Exhaustive route contract plus ad/board real browse, correct handoff, failure fallback and return | Catalog/product/variant/source binding; actual destination with sensitive values absent |
| A27 / 128, 129 | Guide advertises absent tool; old package claims write authority; simulated client counted as external environment/device | Same-candidate complete journey; guide byte parity, real JSON/ZIP/HTML; actual authorized external-environment and physical-device evidence later | Candidate/build, guide/capability/package versions, environment/device and dated reviewer identity |

Use existing relevant tests and command paths as anchors, including package/asset boundaries, artifact delivery/privacy/restore, group preference/response ledger, native WP8/WP9, origins, performance and release self-tests. Inspect test source at the pinned revision before relying on its name. Add focused new behavior regressions under the repository's approved workflow; never weaken existing assertions to manufacture green.

## Common evidence rules

- Record expected failing behavior before a feature patch, then the passing same-scenario proof. A new assertion that already passes is a positive control, not RED. Review text itself is not an executable implementation test.
- Keep one exact integration candidate for final journeys. Bind catalog, rule, guide, package, browser/emulator and device versions. A later code change either invalidates affected proof or has a recorded scope-preserving comparison; a different hash is not silently the same artifact.
- Separate unit/contract checks, actual files/bytes, real separate clients, browser emulation, physical devices, author checks, independent review and owner UX decisions. Report failures and untested cases rather than averaging them into a percentage.
- Negative controls should demonstrate the check notices the fault: leak a synthetic canary, omit a required shard/criterion, replay an operation, use a revoked identity, substitute a different method/version or remove an artifact. Use disposable fixtures; never mutate production data or immutable harness to inject faults.
- Set modest declared local request/byte/runtime budgets per probe. Record slow/flaky baselines instead of changing timeout/parallelism to get a pass. Long exhaustive suites do not justify inflating the inner feature loop.
- No external network, credentials, paid calls, deployment or customer data for local planning/emulator tests. Later real public/provider checks require their own scoped authorization. PDF generation, proofs and benchmarks remain closed.

## Review-update validation (this task only)

Validate the canonical board against a frozen save/hash before atomic replacement. Preserve all pre-WP10 tasks and histories, old reviews, A01–A27 text, model/hero definitions, source candidate receipt and deployment/PDF metadata. Changes are restricted to WP10 definition fields, new prerequisites, the new R20 review and the WP10 summary banner/metadata.

Check unique IDs, existing dependency/check/finding references, acyclic explicit dependencies and Planned status for all new work. Do not add a dependency on MOT-101 to MOT-129: MOT-101 is already the global release gate and that would be a logical cycle. When a prerequisite requires owner review, gate the dependent feature until that decision is recorded; Implemented alone is insufficient for a decision gate.

Render the saved board at desktop and phone widths using the existing local server: correct title, nonblank cards, no script/console errors or framework overlay, unchanged baseline overflow/warnings, search/filter/findings and copied brief behavior, and readable links to these notes. These checks prove the planning artifact remained usable; they do not verify WP10 product behavior.
