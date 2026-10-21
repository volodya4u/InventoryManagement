# Design — trajectory-review-from-log

## One rule, reused
The slice's review counts by the rule the `pr-evidence` **Review** gate applies, not a second copy of it:
`reviewProblems` from `scripts/check-review.mjs`, on the lines `addedLogLines` returns for the pull request, against
`treeFingerprintAt` of the branch head. A hand-written verdict line, a stale tree, a blocking count or a last CHANGES
REQUESTED all fail it the same way they fail the gate.

## Which pull request
For each archived slice:
1. The newest commit on `HEAD` with a `Slice: <name>` line. The line is matched whole in the commit message, because
   commits here often put it above the attribution, apart from git's trailer block.
2. The first merge commit on `HEAD`'s first-parent line that descends from it: the pull request that brought it to
   `main`. Its second parent is the branch head, its first parent the base.

A slice with no such commit, or not merged yet (the branch of the slice itself), reads `missing`. So does a merged slice
whose pull request added no verdict at all.

## Cost
The pre-commit hook runs this script on every commit. Finding the merge, diffing the agent log and fingerprinting the
head cost about 0.3 s per slice, so a merged slice's answer is cached in `target/trajectory/review-cache.json`
(gitignored), keyed by its newest trailer commit. The cache also stores a hash of this script and `check-review.mjs`,
so a change to either rule starts it afresh. Unmerged slices are never cached. A cached run takes about as long as the
check did before this change.

## What it found
On `main`, 20 of the 22 merged slices read `approved (agent log)`. Two do not:
- `harden-frontend-specs` has no commit with its `Slice:` line, so there is no pull request to find.
- `structured-evidence-followups` (#95) reads `not approved`: after its last review commit, the branch merged `main`
  again, so the head is not the tree the reviewer saw. The Review gate did not compare trees until #97, so this is the
  rule applied after the fact, and the warning is accurate.

## The lock
`check-trajectory.mjs` and `check-trajectory.test.mjs` match `scripts/check-*.mjs`, so `factory-lock.json` is re-sealed
in the commit that changes them, with the earlier adaptation notes carried over.
