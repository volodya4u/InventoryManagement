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
whose pull request added no verdict at all, and a slice whose newest `Slice:` commit is itself on the first-parent line
(pushed to `main`, or a squash merge): no pull request merge brought it in, and every later, unrelated merge descends
from it, so taking "the first merge after it" would lend that pull request's approval to the slice (found in review).
Merges are listed with `--topo-order`, so clock skew cannot reorder them.

## Cost
The pre-commit hook runs this script on every commit. Finding the merge, diffing the agent log and fingerprinting the
head cost about 0.3 s per slice, so a merged slice's answer is cached in `target/trajectory/review-cache.json`
(gitignored), keyed by its newest trailer commit, with the merge it came from. The cache is believed only as far as
this:
- an entry counts while its merge is on `HEAD`'s first-parent line, so a checkout of another history gets the cold
  answer;
- the file stores a hash of this script, `check-review.mjs` and `dod-fingerprint.mjs`, so a change to any part of the
  rule starts it afresh;
- a cache file that git tracks (one a branch committed with `git add -f`) is ignored and never written.

Unmerged slices and git errors (a shallow clone, say) are never cached. A cached run takes about as long as the check
did before this change.

## What it found
On `main`, 20 of the 22 merged slices read `approved (agent log)`. Two do not:
- `harden-frontend-specs` has no commit with its `Slice:` line, so there is no pull request to find.
- `structured-evidence-followups` (#95) reads `not approved`: after its last review commit, the branch merged `main`
  again, so the head is not the tree the reviewer saw. The Review gate did not compare trees until #97, so this is the
  rule applied after the fact, and the warning is accurate.

## The lock
`check-trajectory.mjs` and `check-trajectory.test.mjs` match `scripts/check-*.mjs`, so `factory-lock.json` is re-sealed
in the commit that changes them, with the earlier adaptation notes carried over.
