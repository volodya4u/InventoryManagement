# Design — break-run-no-renames

## Why the old path disappeared
`git diff` between two trees detects renames by default (`diff.renames`). With `--name-only` a detected rename prints
only the destination. The case in `scripts/break-run.test.mjs` shows it:

1. a committed `fixtures/cases.json`;
2. at the break, it is moved unchanged to `cases.json`;
3. before this change, `break` listed `cases.json` and `lib.mjs`, and accepted the break.

`--no-renames` turns the rename into a deletion and an addition, so both paths are listed. `isTestPath()` then sees
`fixtures/cases.json`, and the break is refused before anything is recorded.

## What is recorded, and what the gate sees
`patchFiles` in the BreakRun records and in `run.json` is the same list. It now carries both sides of a rename, so the
gate's `isTestPath()` check in `breakRunReason` covers the old path as well. The gate needed no change.

A run recorded before this change keeps its list; any such run on main touches no test path.

## Where else the flag goes
Two more `--name-only` lists only name files in a message:
- the restore's "after reversing the patch the tree is not the start's" in `break-run.mjs`;
- the replay's `changed()` in `break-replay.mjs`, for the local-changes and not-as-it-was messages.

They get `--no-renames` too, so a message names both paths of a move.

The patch keeps git's rename form: `git apply` and `git apply -R` handle it, and its SHA-256 is checked against the
recorded one, not regenerated.
