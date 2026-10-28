# Historical gaps in the process record

Process evidence that was never recorded, or that no longer matches the code, and cannot be rebuilt afterwards. They stay
visible on purpose: `node scripts/check-trajectory.mjs` lists each open one as WAIVED in `docs/qa/trajectory-report.md`, with
the waiver and who approved it (ADR-0009; before that it printed them as warnings), and this file says why none is hidden or
"fixed". The generated report is not edited by hand, the check is not changed to ignore a gap (a gap is waived by name, with
an approval, and a new one fails), and merged history is not rewritten.

A review verdict counts only for the tree it saw, and a `Slice:` trailer is part of a commit that is already merged. So a
review run today on the old code would be a new verdict for a different tree, not the missing one.

## Open (kept, waived)

Since ADR-0009 each row below is waived by an open file in `docs/qa/waivers/` (`2026-10-28-trajectory-*.md`), so the normal run
and `--release` both pass. The trajectory report lists them under "Waived", with the approval, instead of as warnings.
A new gap of either kind is not waived and fails the check.

| Slice | Finding in the trajectory report | What happened | Why it stays |
|---|---|---|---|
| `2026-10-12-harden-frontend-specs` | `trailer`: no commit carries a `Slice: harden-frontend-specs` trailer | Slice H6, merged as #69 (merge `99e6753`, commit `863b6b5`). The commit message has no trailer; the five sibling slices H1-H5 carry theirs. | A trailer cannot be added to a merged commit without rewriting history. |
| `2026-10-21-structured-evidence-followups` | `review-evidence`: the agent log's review is not approved (files changed after the reviewer's last APPROVE) | #95 (merge `50a29eb`). The last APPROVE was logged at 21:48Z on 2026-10-20 for a tree committed ten seconds earlier than `0ea93af`. Afterwards the branch merged `main` again (`e3e2f69`) and added evidence commits (`bb9768a`, `4852178`). Compared with `0ea93af`, the final head differs by `main`'s `scripts/hooks-pre-commit.mjs` change and its test, `README.md`, `docs/autonomy-log.md` and the generated report, trace and log files; none of the slice's three scripts (`test-results.mjs`, `test-run.mjs`, `pr-evidence.mjs`) or their tests changed. | No reviewer ran on the final tree, and the rule cannot tell a merge of `main` from a code change, nor should it. The honest record is this paragraph. |

## Recovered (closed with provenance)

`2026-10-12-harden-frontend-specs` was reported as having no review. A review did run: the log lines that commit added hold
three reviewer verdicts (CHANGES REQUESTED, then two APPROVE), and the last APPROVE's tree equals the head tree of #69.
The trajectory check could not find them only because the trailer is missing (above). The archived change now carries a
`review-findings.json` with `clean: true` that says it was recovered, lists the verdicts and trees, and names the replay
that shows no problem for the merge. It is a record of the log, not a new review.

## Repaired (closed)

The six archives `2026-10-12-harden-security-tests`, `-raw-material-tests`, `-product-and-production-tests`,
`-sales-reports-history-tests`, `-infrastructure-tests` and `-frontend-specs` had no `design.md`. Each now has one, headed
as reconstructed on 2026-10-27. They are written from the slice's `proposal.md`, `tasks.md` and merged commit, and say
only what that diff shows. Reasoning the original author may have had beyond that was not saved and is not invented.

## Rules for the future

- A new slice reaches `openspec/changes/archive/` with `proposal.md`, `design.md` and `tasks.md`, and its commits carry
  `Slice: <name>`.
- After a merge of `main` into a slice branch, run the reviewer again before the last commit.
- Remove a row from "Open" only when the trajectory report no longer lists it, as a warning or as waived.
- Archive a slice in its own pull request after its work has merged: its review is read from the pull request that merged it.
