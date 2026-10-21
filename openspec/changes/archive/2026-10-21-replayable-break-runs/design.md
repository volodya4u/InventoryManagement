# Design — replayable-break-runs

## Two workflows
- **New behaviour: red → green, unchanged.** The test is written first, fails on an assertion, the code changes, and the
  test passes.
- **Existing behaviour (`Kind: hardening`): green → controlled break → red → restore → green.**
  1. `break-run.mjs start` runs the new test on the current code, and it must pass.
  2. The author breaks the code under test by hand: the smallest edit that should make the test fail.
  3. `break` saves that edit as a patch and runs the test, which should fail on an assertion.
  4. `restore` reverses the patch and runs the test again, which should pass.

## Snapshots and the patch
Each step snapshots the working tree as a git tree object through a throwaway index:

1. `read-tree HEAD`;
2. `add -A`;
3. `rm --cached` of the evidence folder and `.agent-log`;
4. `write-tree`.

The real index and the working tree are untouched. Step 3 drops the two paths after the add rather than excluding them,
because git refuses a pathspec that names an ignored path.

- **The patch:** `git diff --binary <start tree> <broken tree>`. It carries exactly the hand-made edit, even when the
  new test file is not committed yet.
- **The break is refused** when it changes nothing, or touches a file in the start record's `testFiles`.
- **The restore** runs `git apply -R`, unless the tree is the start's already (the break undone by hand), and then
  compares the new snapshot with the start's tree. A difference, such as an edit made after the break, stops the
  restore before any test runs. A run whose break or restore did not go as expected cannot be stepped again: restore
  it and start a new run, as the messages say.

## Records and evidence
`BreakRun` records go through `appendRecord`, like TestRun records, so the commit folds them into
`.agent-log/actions.jsonl`. Each carries the TestRun fields plus `run`, `step`, `patchSha256` and `patchFiles`.

`run.json` and `mutation.patch` sit in `docs/evidence/break-runs/<run-id>/`:
- **`docs/` keeps them out of the code fingerprint**, so writing them never changes the code the restore is compared with.
- **`-text` in `.gitattributes` keeps the patch's bytes exact.** A CRLF checkout would otherwise change its SHA-256.

The patch is git's `diff --binary` output as raw bytes, never trimmed or re-encoded. The review found that trimming
dropped a blank last context line (`" \n"`) and corrupted the patch, so `git apply -R` failed. The tool hashes those
bytes. `pr-evidence` hashes the committed blob's bytes at the head commit, and the replay hashes the file's bytes;
both compare against the run's `patchSha256`. When `git apply` fails, the restore and the replay report git's message
instead of throwing.

## The gate
A criterion of a `Kind: hardening` proposal passes with either red → green, or one complete break run on its own test
(`statusIn` reads the run's per-test results, as for TestRun). A complete run meets all of these:

- a green start;
- a break that fails that test on an assertion, on a different code fingerprint, without touching the test file;
- a restore of the same patch back to the start's code, green, on the head commit's code;
- a committed patch equal to the one that ran.

When no run is complete, the message names each run and its first failing condition.

## Replay
`break-replay.mjs` needs a clean tree (outside `.agent-log`), so it can check the reverse leaves nothing behind. It
always reverses the patch in a `finally`. It records nothing: a replay is the reviewer's check, not the branch's evidence.

Frontend replays need `frontend/node_modules`, as `test-run.mjs` does. A replay runs in place, so it needs no second
checkout.

## The nested-runner fix
Inside a `node:test` process, a child `node --test` sees `NODE_TEST_CONTEXT` and reports to the parent instead of writing
its JUnit file. The harness command now runs without that variable.
