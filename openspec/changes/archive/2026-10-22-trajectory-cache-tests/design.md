# Design — trajectory-cache-tests

## Making git fail on purpose
The two error paths need git to fail after the merge has been found. Each case moves one loose object of the branch
head aside in the throwaway repository (`.git/objects/xx/…` renamed to `….hidden`):
- **The agent log's blob.** `addedLogLines` diffs `.agent-log/actions.jsonl` between the merge's parents, and that diff
  must read the blob, so it fails. Finding the merge and listing the parents read only commits, so they still work. The
  case then renames the object back to show that the next run reads the real answer, which a cached error would hide.
- **The `scripts/` tree.** The log diff is limited to the log's path, so it never opens that tree and the verdict lines
  are read. `treeFingerprintAt` lists the whole tree with `git ls-tree -r`, so it fails. The case wraps the run in
  `assert.doesNotThrow`, so a generator that crashed would fail on an assertion, not as an error of unknown cause.

## Showing the cache is read
The first existing case checks that a warm run gives the cold answer, which a run that ignored the cache would give
too. The new case plants an entry, under the current rules, for the real pull request merge and claims an approval
that the cold run does not give. The answer changes, so the run read the entry. The rules case plants the same entry
under another hash and gets the cold answer. Together the two cases show that the hash discards the entry, rather than
the entry never matching.

## Break runs
None of the four paths changed, so each case is shown red with a break run of `scripts/check-trajectory.mjs` that
removes the one guard the case pins:
- the `addedLogLines` catch returns an answer instead of `null`;
- the `treeFingerprintAt` try/catch is removed;
- the `rules` comparison is dropped;
- the cache lookup is skipped.

## Archived after merge
The change was archived after #109 merged, not in #109. Archiving it there would have added its own `Slice:` row to
`trace/trajectory.json`. That row changes after the commit, which would move the code fingerprint away from the code
the break runs restored to, the code the Red → green gate compares against the head commit.
