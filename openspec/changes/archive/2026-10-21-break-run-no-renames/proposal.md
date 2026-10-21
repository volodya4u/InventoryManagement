# List both paths of a renamed file in a break's patch files

## Why
The review of #102 (`break-run-follow-ups`) left one non-blocking gap. `break-run.mjs break` checks each file of the
patch with `isTestPath()`, but it takes the file list from `git diff --name-only`, and that diff detects renames. A break
that moves a fixture out of its test folder lists only the new path:

- `fixtures/cases.json` → `cases.json` shows as `cases.json`;
- `isTestPath("cases.json")` is false, so the break is accepted.

The same list is recorded as `patchFiles`, which the gate (`breakRunReason` in `scripts/pr-evidence.mjs`) checks with
the same function, so the gate inherits the gap.

## What Changes
- `breakRun` in `scripts/break-run.mjs` lists the patch's files with `git diff --name-only --no-renames`. A rename then
  shows as a deletion of the old path and an addition of the new one, so a test path on either side is refused. The
  recorded `patchFiles` carry both paths, so the gate sees them too.
- The two lists that only name files in a message use `--no-renames` as well: the restore's "not the start's" list in
  `break-run.mjs` and the replay's `changed()` in `scripts/break-replay.mjs`. A message then names both paths.
- The patch itself (`git diff --binary`) is unchanged: `git apply` reproduces a rename either way.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a committed fixture in a test folder, when the break moves it out of the folder unchanged, then break refuses it, naming the old path, and records nothing | `scripts/break-run.test.mjs` › "a break that moves a fixture out of its test folder is refused, so a rename does not hide the test path" |

## Impact
- Affected specs: none. This is harness work with no FR row, so the change declares no spec delta (`skip_specs` in
  `.openspec.yaml`).
- Affected code: `scripts/break-run.mjs` and `scripts/break-replay.mjs`, with `scripts/break-run.test.mjs`. Neither is
  a locked gate file, so there is no re-seal and no `Refs: PD-n`. `scripts/pr-evidence.mjs` is unchanged: it reads the
  recorded `patchFiles`.
- Break runs recorded before this change keep the list they recorded.
- Dependencies: none.
