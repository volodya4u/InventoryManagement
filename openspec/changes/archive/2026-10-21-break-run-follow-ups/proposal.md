# Close the follow-ups of the replayable-break-runs review

Kind: hardening

## Why
The final review of slice 4 of the evidence-integrity plan (#101, `replayable-break-runs`, ADR-0005) approved it and
listed non-blocking follow-ups:

- **The replay can fail falsely on a CRLF checkout.** `scripts/break-replay.mjs` decides with `git status --porcelain`
  whether the tree is clean before it applies the patch and whether the reverse put it back. With `core.autocrlf=true`,
  `git apply -R` can write a file back with other line endings. `git status` then lists it as modified although its
  blob id is HEAD's and `git diff` is empty.
- **The replay trusts parts of the run it does not check.** It replays a run that was never restored, and it runs the
  test files that are in the tree now, not the ones the run recorded (`testFiles`).
- **Only the run's own test file is protected.** `break-run.mjs break` and the gate (`breakRunReason` in
  `scripts/pr-evidence.mjs`) refuse a patch that edits a file in the start record's `testFiles`. A patch that edits a
  fixture, a test resource or another test passes.
- **`pr-evidence` prints git's fatal line** for every run with no committed `mutation.patch`.
- **One phrase in the design note is wrong.** It says "byte for byte" where the file only matched as git stores it.
- **Two replay paths have no test:** a patch whose SHA-256 does not match, and a replayed break that no longer fails.

## What Changes
- `scripts/break-replay.mjs`:
  - Decides on snapshots, not `git status`. Before the patch, `snapshot(root)` must equal HEAD's tree as a snapshot
    stores it (`snapshot(root, { worktree: false })`, new), and the run's own evidence folder must have no changes.
    After the reverse, the snapshot must equal the one taken before.
  - Refuses a run with no restore step.
  - Refuses a run whose recorded `testFiles` blob ids are not the working tree's, before anything is applied.
- `scripts/break-run.mjs` exports `isTestPath()`. A test path is any of:
  - a path under `src/test/`;
  - a `*.spec.ts`, `*.test.ts` or `*.test.mjs` file;
  - a path inside a `test`, `tests`, `__tests__`, `fixtures`, `__fixtures__`, `__mocks__`, `testdata` or `test-data`
    folder.

  `break` refuses a patch that touches any test path, as well as the run's own test files.
- `scripts/pr-evidence.mjs`:
  - `breakRunReason` uses the same `isTestPath()`, and its reason now reads "the break edits a test or its fixtures".
  - The `git show` that reads each run's patch passes `stdio: ["ignore", "pipe", "ignore"]`.
- In the archived `replayable-break-runs` design, the "On a Windows checkout" section now says the restored file
  matched as git stores it (its blob id), not byte for byte.
- The `CLAUDE.md` how-to says `break` refuses any test path.

`Kind: hardening`: criteria 5 and 6 pin replay behaviour that already existed, so they pass from the start. Each is
shown red with a recorded break run of `scripts/break-replay.mjs`. Criteria 1–4 are new behaviour and go red, then
green, through `scripts/test-run.mjs`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a CRLF checkout where reversing the patch rewrites a file that git status then lists although its blob id is HEAD's, when the run is replayed, then the replay passes | `scripts/break-run.test.mjs` › "replay judges the tree by its content as git stores it, so a file git status flags with unchanged content does not fail it" |
| 2 | Given a run that was never restored, or a test file changed since the run, when it is replayed, then the replay refuses it and, for the changed test, applies and runs nothing | `scripts/break-run.test.mjs` › "replay refuses a run that was never restored, or whose test file is not the one the run recorded" |
| 3 | Given a break that also edits a fixture another test reads, when break runs, then it is refused and records nothing; test paths are told apart from code paths | `scripts/break-run.test.mjs` › "a break that touches any test path is refused, not only the run's own test file" |
| 4 | Given a hardening break run whose patch touches a test resource, a spec or a fixture, when Red → green is checked, then the run does not count | `scripts/pr-evidence.test.mjs` › "hardening: a break run whose patch touches any test path, not only the criterion's test file, does not count" |
| 5 | Given a committed mutation.patch edited after the run, when the run is replayed, then the replay refuses it and changes nothing | `scripts/break-run.test.mjs` › "replay refuses a mutation.patch that is not the patch the run recorded, and changes nothing" |
| 6 | Given code that moved on so the recorded patch still applies but no longer breaks the test, when the run is replayed, then the replay reports that the test passed, and the patch is reversed | `scripts/break-run.test.mjs` › "replay reports a recorded break that no longer fails its test" |

## Impact
- Affected specs: none. This is harness work with no FR row, so the change declares no spec delta (`skip_specs` in
  `.openspec.yaml`).
- Affected code: `scripts/break-replay.mjs`, `scripts/break-run.mjs`, `scripts/pr-evidence.mjs` and their tests. None
  is a locked gate file (`factory-lock.json`), so there is no re-seal and no `Refs: PD-n`.
- Docs: the archived `replayable-break-runs` design note (one phrase) and `CLAUDE.md` (one line).
- Dependencies: none.
