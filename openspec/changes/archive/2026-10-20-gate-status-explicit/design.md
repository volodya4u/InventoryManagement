# Design — gate-status-explicit

## Gate status
Each gate in `scripts/pr-evidence.mjs` is `{ name, applies, problems, waived, detail }`. Its status comes from one
function, `gateStatus`:

- any problem left → `FAIL`;
- else any waived item → `WAIVED`;
- else `applies` → `PASS`;
- else → `N/A`.

Applicability is decided per gate:

| Gate | Applies when |
| --- | --- |
| Review | always |
| Definition of done | the branch changes code (the code fingerprint differs from the merge base) |
| Specs | always |
| Red → green | the branch adds or changes an acceptance criterion, or adds a slice proposal |
| Autonomy log | the branch touches a significant path |
| Evals | the branch changes an eval input |
| Docs lookup | the branch adds an import nothing on the base imports |

`detail` says what held, or why the gate did not apply. Only FAIL sets exit code 1. A WAIVED row lists each waived item
and the waiver's approval line, so an exception is never hidden behind a pass.

## Which criteria Red → green checks
`git diff --name-status -M <base>...<head>` lists the acceptance files the branch touches: `docs/specs/*.md` (not
`TEMPLATE.md`) and `openspec/changes/[archive/]<slice>/proposal.md`. For each one, the head version is parsed with
`parseSpec` from `scripts/check-specs.mjs` and compared with the merge-base version: the same path, or the old path of a
rename. A criterion counts when its number is new or when its Given / When / Then text or its test cell changed. Moving a
change into `archive/` is a rename, so archiving alone asks for no new evidence.

A proposal the branch adds with no criteria is a problem, because otherwise leaving out the table would make the gate pass.
A proposal that already existed is not asked to grow a table.

## Waivers
A gate waiver uses the existing `docs/qa/waivers/` folder, so `correct.mjs --detect` raises a correction that the owner
must disposition, as for a requirement waiver. It counts only when:

- the branch adds it;
- it has a `Status: open` line (a waiver without one is not open);
- it says `Gate: Red → green`;
- it has a non-empty `Approval:` line.

Its `Criteria:` line lists `<path> AC<n>, AC<m>` items, or `<path>` alone for every criterion of that file and for a
missing table. Several paths are separated by `;`. A waiver must not mention a requirement id unless it means to waive it, because `check-acceptance-methods.mjs`
suppresses every id a waiver mentions.

## Harness tests
`scripts/x.test.mjs` › "title" is a file reference, like a frontend spec. `check-specs.mjs` finds the `test("title"`
in that file. It checks active slice proposals on every run, and in a pull request (`prSpecProblems`) also each
proposal the branch adds, so creating a slice straight under `archive/` does not skip the check. `pr-evidence.mjs` matches a TestRun with `target: harness` and that file as the selector. Matching by
test id instead of by file is slice 2 (`structured-test-evidence`).

## Not in this slice
- Per-test identity, failure kinds and fingerprints for the green run (slice 2).
- Where review evidence comes from (slice 3).
- Replayable break runs for hardening slices (slice 4).
