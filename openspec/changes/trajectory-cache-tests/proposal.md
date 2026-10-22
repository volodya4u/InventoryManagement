# Pin the error and cache paths of the trajectory review evidence

Kind: hardening

## Why
The final review of #108 (`trajectory-review-from-log`) approved `scripts/check-trajectory.mjs` reading an archived
slice's review evidence from the agent log, and noted that four of its paths have no test:

- a git error while reading the merged pull request (a shallow clone, a missing object) must read `missing` and must not
  be written to `target/trajectory/review-cache.json`, or the slice would stay `missing` after the error is gone;
- a `treeFingerprintAt` that throws must read `missing`, not crash the generator the pre-commit hook runs;
- a cache written under other rules (its `rules` hash differs) must be discarded;
- a warm run must actually read the cache: the existing case only shows a warm run gives the cold answer, which a run
  that ignored the cache would give too.

It also noted that autonomy-log row 76 names two of the five review rounds of #108.

## What Changes
- Four cases in `scripts/check-trajectory.test.mjs`, on throwaway repositories as the existing cases build them. The
  git error and the fingerprint failure are made by moving a loose object of the branch head aside: the agent log's blob
  (the diff of the log fails) and the `scripts/` tree (the diff of the log still works, `git ls-tree -r` does not).
- No behaviour changes: `scripts/check-trajectory.mjs` is not edited. Each case is shown red with a recorded break run
  of it (`node scripts/break-run.mjs`).
- `factory-lock.json` is re-sealed for the changed test (it matches `scripts/check-*.mjs`), owner-approved, with the
  earlier adaptation notes carried over.
- Autonomy-log row 76 lists all five review rounds of #108; a new row records this slice.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a merged slice whose agent-log blob git cannot read, when the trajectory is checked, then it reads missing, nothing is cached, and once git can read it the next run reads the real answer | `scripts/check-trajectory.test.mjs` › "a git error while reading a merged slice's agent log reads missing and is not cached" |
| 2 | Given a merged slice with a verdict whose branch-head tree cannot be fingerprinted, when the trajectory is checked, then the generator does not crash, the slice reads missing and nothing is cached | `scripts/check-trajectory.test.mjs` › "a tree fingerprint that throws reads missing instead of crashing the generator" |
| 3 | Given a cache entry claiming an approval under a rules hash other than the script's, when the trajectory is checked, then the entry is discarded and the slice reads its cold answer | `scripts/check-trajectory.test.mjs` › "a cache written under other rules is discarded" |
| 4 | Given a cache entry under the current rules for the real pull request merge, when the trajectory is checked again, then the slice reads the cached answer, not the cold one | `scripts/check-trajectory.test.mjs` › "a warm run reads a merged slice's answer from the cache" |

## Impact
- Affected specs: none. This is harness work with no FR row, so the change declares no spec delta (`skip_specs` in
  `.openspec.yaml`).
- Affected code: `scripts/check-trajectory.test.mjs` (locked) and `factory-lock.json`; `scripts/check-trajectory.mjs`
  is unchanged.
- Docs: `docs/autonomy-log.md` (row 76 and a new row), the break-run evidence under `docs/evidence/break-runs/`.
