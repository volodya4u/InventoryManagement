# Design — break-run-follow-ups

## Why git status flags a file whose content is unchanged
The case in `scripts/break-run.test.mjs` reproduces the flag on demand:

1. a throwaway repository with `core.autocrlf=true`;
2. an LF working copy, committed (`git add` refreshes the index's stat data for it);
3. `git apply` of the patch, then `git apply -R`.

`git apply` writes the working copy with CRLF line endings, as `core.autocrlf=true` asks. `git status --porcelain` then
lists ` M lib.mjs`. Yet `git diff` is empty and `git hash-object lib.mjs` equals `HEAD:lib.mjs`.

git's stat check takes a file whose size changed as modified without reading it, so the longer CRLF copy is listed.
`git diff` compares the content and finds none. The old replay hit exactly this: it reported "after reversing the patch
the working tree is not as it was: M lib.mjs" for a tree that was as it was.

## Snapshots instead of git status
`snapshot(root)` already stores the working tree as git would (`git add -A` into a throwaway index), so the CRLF copy
and the LF copy give the same tree. The replay now:

- **before the patch:** takes `before = snapshot(root)` and compares it with `snapshot(root, { worktree: false })`, which
  is HEAD's tree with the same paths left out (the evidence folder and `.agent-log`). Any difference means local
  changes, and the message lists the files.
- **the run's own evidence:** snapshots leave the evidence folder out, but the replay reads `run.json` and
  `mutation.patch` from the working tree. So `git status` still checks that one folder. `.gitattributes` marks it
  `-text`, so line endings cannot flag it.
- **after the reverse:** compares `snapshot(root)` with `before`.

## What the replay now checks first
These refusals come before anything is applied, so a refused replay leaves the tree untouched:

- **No restore step:** a run that was never restored is not complete evidence; the gate would not accept it either.
- **Test files:** each recorded `testFiles` blob id must be the blob of that path in `before`. A test changed since the
  run may no longer check what the break broke, so a replay of it would prove nothing. A run that recorded no test file
  is refused for the same reason.

## Test paths
`isTestPath()` in `scripts/break-run.mjs` is shared by `break` and the gate, so both refuse the same patches. Besides
the run's own `testFiles`, a test path is any of:

- a path under `src/test/` (Java tests and their resources);
- a `*.spec.ts`, `*.test.ts` or `*.test.mjs` file;
- a path inside a test or fixture folder: `test`, `tests`, `__tests__`, `fixtures`, `__fixtures__`, `__mocks__`,
  `testdata` or `test-data`.

Names such as `scripts/test-run.mjs` or `scripts/test-results.mjs` are code, not tests. The archived run
`20261021T155613Z-b647` broke `scripts/test-results.mjs`, and it still counts.

## The two pins
Criteria 5 and 6 pin replay behaviour that already existed, so they pass from the start. Each is shown red with a
break run of `scripts/break-replay.mjs`, recorded under `docs/evidence/break-runs/`:

- **Criterion 5:** the run drops the SHA-256 check.
- **Criterion 6:** the run stops treating a test that passed under the break as a problem.

Criterion 6's test needs a header above the code. A hunk that starts at line 1 is anchored there by `git apply`, so it
would not apply at an offset to code that moved.

The first red record of that test failed for this setup reason, not for the behaviour, so the break run is its
evidence. The gate counts either.

## Not changed
- `restoreRun` in `break-run.mjs` already compared snapshots.
- The gate never read `git status`.
