# Make deliberate-break testing reproducible

## Why
A test that pins behaviour that already exists passes from the start, so it cannot go red before a change. The
hardening slices of 2026-10-12 and the bootstrapping of slice 2 (#92) showed such tests red by breaking the code they
test by hand. Each did it the same way:

1. edit a production file;
2. run the test through `test-run.mjs`;
3. restore the file.

The break was never saved, and nothing recorded that the restore matched the start, so another reviewer could not
replay it without reading the pull request's narrative. Slice 4 of the evidence-integrity plan (ADR-0005) makes the
break a recorded, replayable workflow, next to red → green for new behaviour.

## What Changes
- New `scripts/break-run.mjs` with three steps under one run id:
  1. `start <target> <selector>` runs the test, which must be green, and snapshots the working tree;
  2. `break <run-id>` saves the edit made since the start as `mutation.patch`, refuses a patch that touches the test
     file or changes nothing, and runs the test;
  3. `restore <run-id>` reverses the patch, checks that the tree is exactly the start's, and runs the test again.

  Each step appends a `BreakRun` record to the agent log: the step, the code fingerprint, every test's result, and the
  patch's SHA-256 and files. The run's `run.json` and `mutation.patch` are written to
  `docs/evidence/break-runs/<run-id>/` and committed with the pull request. Under `docs/` they are not code, so they do
  not change the fingerprint the restore is checked against. `.gitattributes` keeps their bytes exact.
- New `scripts/break-replay.mjs <run-id>`. On a clean tree it:
  1. applies the committed patch;
  2. checks that each test the break recorded as an assertion failure fails on an assertion again;
  3. reverses the patch;
  4. checks that the tree is unchanged;
  5. runs the test once more.
- In `pr-evidence`, a slice proposal with a `Kind: hardening` line accepts, for each of its criteria, a complete break
  run instead of red → green. A run is complete when:
  - its start is green;
  - its break changed code but not the test file, and failed the criterion's own test on an assertion;
  - its restore reverses the same patch and returns to the start's code, which is the head commit's code;
  - the patch is committed as it ran.

  Other slices keep red → green only.
- `scripts/test-run.mjs` exposes its runner as `executeRun`, so the break steps and the replay run tests the same way.
  A harness run no longer inherits `NODE_TEST_CONTEXT`, which made a `node --test` inside another test process report
  to the parent instead of writing its report.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a hardening criterion with a green start, a red break on its own test and a restore to the head commit's code, when Red → green is checked, then it passes | `scripts/pr-evidence.test.mjs` › "hardening: a criterion passes with a break run: green, red on its own test, restored to the head commit's code" |
| 2 | Given a break run that is missing its restore, restores to other code, goes red on another test, edits the test file, or whose patch is not committed, when Red → green is checked, then it does not count | `scripts/pr-evidence.test.mjs` › "hardening: a break run without a restore, restored to other code, red on another test, touching the test file, or whose patch is not committed does not count" |
| 3 | Given a slice that is not marked hardening, when it has only a break run, then the criterion fails, and a hardening slice still accepts red then green | `scripts/pr-evidence.test.mjs` › "hardening: only a slice marked Kind: hardening accepts break runs, and it still accepts red then green" |
| 4 | Given a repository with a green test, when start, a hand-made break, break and restore run, then the patch, the fingerprints and each test's results are recorded under one run id and the code is back | `scripts/break-run.test.mjs` › "start, break and restore record the patch, the fingerprints and each test's results under one run id" |
| 5 | Given a red test at the start, no edit before the break, or an edit to the test file, when the step runs, then it is refused | `scripts/break-run.test.mjs` › "a break that edits the test file, changes nothing, or starts from a red test is refused" |
| 6 | Given a committed break run, when it is replayed, then the patch fails the test as recorded and the tree is left as it was | `scripts/break-run.test.mjs` › "replay applies the recorded patch, sees the test fail as recorded, and leaves the tree as it was" |
| 7 | Given a break undone by hand, or an extra edit made after the break, when restore runs, then the first restores green and the second is refused | `scripts/break-run.test.mjs` › "restore accepts a break undone by hand and refuses a tree that is not the start's" |

## Impact
- Affected specs: none. This is harness work with no FR rows. The decision is recorded in
  `docs/adr/0005-evidence-integrity.md`.
- Affected code:
  - `scripts/break-run.mjs` and `scripts/break-replay.mjs` (new), with `scripts/break-run.test.mjs`;
  - `scripts/pr-evidence.mjs` and `scripts/test-run.mjs`, with their tests;
  - `.gitattributes`;
  - the `CLAUDE.md` how-to.

  No locked gate file changes.
- Not in this slice: the `test-first-loop` skill still describes only red → green. Changing it needs a paid eval run,
  so CLAUDE.md carries the how-to until the owner chooses to update the skill.
- Dependencies: none.
