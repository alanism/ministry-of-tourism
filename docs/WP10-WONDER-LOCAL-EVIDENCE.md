# WP10 local Wonder implementation evidence

Muse Wonder (`muse-wonder-1.0`) authored the new FCC audit and launch-evidence
proposal through seven actual API calls. Codex orchestrated source review,
added/corrected regression fixtures, executed the checks and integrated locally.
Receipts are in `WP10-WONDER-LOCAL-EVIDENCE.json`; no Astra call or independent
verification is claimed. The council lenses are engineering constraints drawn
from the supplied documents, not those people acting as reviewers.

Code checkpoint: **e269e851721fbed728e9ccdbc02b7fedc7e4b7b9**, fast-forwarded
from **22e35fe9fae990af906cd651179de038af81fb95** onto
`codex/local-release-consolidation-20261031`. Only four new files were added:
the audit, its tests, audit documentation and the MOT-132 proposal. Every
existing file, including tests, release checker, configuration and catalogs,
is unchanged. This evidence-only receipt is a subsequent local commit.

## Executed checks

- New audit tests: **22 passed**; recorded RED probes preceded the repairs.
- Unchanged `npm run check`: **902 tests / 162 files**, four TypeScript projects,
  **36.389 seconds** overall, passed.
- `npm --prefix apps/web run build`: passed in **6.005 seconds**.
- Existing artwork verifier: **5,203 entries**, publication digest unchanged:
  `b6164f92449667fea5f371fb2e85d47d285897167a1277994ced2da162c2717e`.
- Two complete audits on the implementation worktree and one on the exact
  candidate produce **byte-identical reports**, each in about five seconds.
  The CLI correctly exits **2** because the audit finds gaps. This is a
  successful tool execution, not passing FCC coverage or A23 acceptance.
- **2,422 input files / 72,254,242 bytes** were inspected. The 611 frozen FCC
  source/runtime metadata files are unchanged. No image files or live URLs
  were fetched. Inline image locators encountered inside metadata were hashed
  as text; their payloads were neither decoded nor copied into the final report.

## Audit findings and next work

The denominator contains **8,507 source rows**: **5,010 matched**, **2,664 with
no match**, and **833 unresolved**. MoT has **193 unmatched entries** and zero
duplicate IDs. These are reconciliation rows, not a count of unique usable
designs or proof that each unmatched row should be published: full sheets,
crops, registry uses and missing provenance need distinct dispositions.

All **3,432 declared journal derivatives** remain accounted for: **3,228
matched**, **188 without a match**, **16 unresolved inline source mappings**.
All **649 apparel entries** reconcile by metadata; shop handoff and human
discovery remain separate checks. Among the uncovered rows are full sheets,
portrait sheets, airport tags and magazine entries. There are 814 unaccounted
registry-use issues and 342 candidate origin/role/alias mismatches to triage;
these are not automatically 1,156 distinct product defects.

MOT-121 stays **In progress** for source/eligibility disposition and full
discovery evidence. Use this inventory for MOT-122 and MOT-127; do not edit FCC,
silently exclude rows, or rewrite the catalog merely to make the audit green.
Source registry and optimized release versions differ and remain explicitly
recorded. No new upstream rights or embedding permission is inferred.

MOT-132's [proposal](WP10-LAUNCH-EVIDENCE-CONTRACT.md) maps A15-A27 to evidence
and negative controls. Its five owner decisions remain unapproved. It changes
no checker, assertion, time budget, or release behavior. MOT-132 stays
**In progress** pending owner/reviewer disposition.

Full reports, RED/GREEN logs, exact raw metadata hashes, model receipts and
board screenshots are local in `Design Sprints/WP10-Wonder-Easy-2026-10-31/`
under the Ministry of Tourism planning folder. The report SHA-256 is
`bdc59a850bdecd7883540142628c8236db3495bf44a24065385526f8fbb53a40`.
The JSON evidence receipt also records the report size, per-category counts
and limitations. The old WP9 runner's null-URL limitation remains as previously
recorded; no fresh product browser/device/external-environment result is claimed.

## Empirical model failures

Initial drafts had invalid fixture crops/URLs, acceptance-ID drift, URL/hash
alias errors, lost rights, dropped source sheets, an unsuitable 1 MiB city
cap, oversized retained buffers and inline-image report amplification. These
were rejected or reproduced before repairs. The actual maximum city metadata
file is 2,512,419 bytes; this new tool uses a bounded 4 MiB city limit, with
16 MiB other-file and 128 MiB unique-total limits. Existing harness bounds
were never changed. Windows containment uses a real directory junction,
with no skipped assertion or privilege escalation. One truncated model
response was recovered only through its complete parsed module string; the
incomplete document was discarded. Later edits used exact-match patches.

Recheck these failure modes around **2027-04-30** under the then-current
unchanged harness (six-month empirical retry note; no automation scheduled).

Everything remains local apart from the expressly requested Wonder generation
calls. No push, deployment, catalog publication or acceptance of production,
physical-device, external-environment, independent-review or PDF work occurred.
