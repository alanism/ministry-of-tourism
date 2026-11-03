# Release source and Git workflow

The authoritative release branch is **`main` in `alanism/ministry-of-tourism`**. Feature and review branches are inputs to it, not alternative release authorities. A source merge does not authorize a deployment or close outstanding acceptance requirements.

Use a dedicated release checkout, separate from active model worktrees. Its `origin` must be `https://github.com/alanism/ministry-of-tourism.git`, and local `main` must track `origin/main`. Use fast-forward-only pulls and ordinary, non-forced pushes. For new tasks, branch from the current `origin/main`; stage only the task's files and reconcile through an isolated integration checkout.

## Reconciliation on 31 October 2026

| Input | Treatment |
| --- | --- |
| `c62ed38`, MOT-101 public source candidate | Retained through its descendant `05f1dd2`, including source recovery, grounded proposals and native workflows |
| `05f1dd2`, published WP2 completion | Release base; all incoming WP2 regressions retained |
| `8e80745`, completed W1–W6 integration | Merged with ancestry; includes W1 recovery, group planning, ballot, workflow and Muse command-shape fixes |
| `4b27516` and `9856678`, destination review and polish | Applied as source patches; their unrelated private ancestry is not imported |
| `aa8a9bd`, concurrently published homepage demo | Merged before publication; the restored production video and its regressions are retained |

The three conflict resolutions preserve both the public candidate's recovery behavior and the review fixes: the Magazine button class is corrected, runtime documentation retains both receipts and live-review evidence, and Muse command guidance permits supplied citations on newly created cards while prohibiting source replacement on existing cards. A focused regression covers that last integration boundary.

The older private checkout has a different Git root. Preserve it for provenance and active work; do not merge it using `--allow-unrelated-histories`, reset it to public `main`, or push its history to the public repository. A different hash alone is not missing work: compare patches and content before porting changes. Historical branch names are retained for traceability.

## Worktree retirement

Before removing a worktree, confirm its patches are integrated or preserved under an archive ref, inspect tracked/untracked changes and ignored output, and check running processes and session ownership. A clean worktree can still be in use. Preserve worktrees supporting running servers or unfinished sessions. Remove only the verified inactive worktree, and detach any dependency junction without traversing its target. Never apply blanket `git clean`, reset, forced branch deletion, or recursive deletion across checkouts.

The private checkout's legacy deployment override and scratch probe are retained locally. The authoritative public branch already commits the `nonhumanintelligence` / `ministryoftourism` Hosting mapping. FCC remains a separate repository.

The isolated local candidate and exact tested inputs are recorded in `LOCAL-RELEASE-CANDIDATE.md`. Final local Muse diagnostics and the ledger replacement/directory durability follow-up are integrated there. Local barrier verification does not certify physical power-loss behavior or clear production Muse ingress/acceptance, permissions/retention, device, guide or release-approval holds. The repository's tests, timeouts, compiler settings and lint rules remain the governing harness; this reconciliation does not loosen them.

The local candidate also merges the specifically requested WP6 `d23b163` at `884bcf3`. Six files already matched, so this adds only the app-only origins runner/documentation and real ancestry. Later WP6 production revisions and approvals remain separate; see the candidate note for the preserved default ledger CLI timing failure and complete complementary test results.

The next requested checkpoint merges `0355bb6` at `169ddc9`, including the owner-approved exact guide-URL test contract updates. All other existing harness files/settings remain unchanged. The default 902-test check, four TypeScript projects and build pass. Production/device holds and prior evidence remain separate from this local merge; see the current candidate note for the retained legacy WP9 null-URL assertion and local updated-contract probe.
