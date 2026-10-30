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

The private checkout's legacy deployment override and scratch probe are retained locally. The authoritative public branch already commits the `nonhumanintelligence` / `ministryoftourism` Hosting mapping. Writer's Board and FCC remain separate repositories.

Outstanding Muse production-ingress/acceptance and ledger power-loss durability work retain their existing status. The repository's tests, timeouts, compiler settings and lint rules remain the governing harness; this reconciliation does not loosen them.
