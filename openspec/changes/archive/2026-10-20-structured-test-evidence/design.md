# Design — structured-test-evidence

## Reports
| Target | Report | Read from |
| --- | --- | --- |
| backend | Surefire XML | `target/surefire-reports/TEST-*.xml` written during this run (modified at or after its start) |
| frontend | Vitest JSON (`--reporters json --reporters default --output-file target/test-run/vitest.json`) | that file, deleted before the run |
| harness | node:test JUnit (`--test-reporter=junit --test-reporter-destination=target/test-run/harness.xml`, plus `spec` to stdout) | that file, deleted before the run |

The second reporter keeps the console output that the summary fallback and the person running the loop read. The
`json` and `junit` reporters were looked up first: the `ng test` options in the Angular 22 CLI reference, and Node's
built-in `junit` reporter, by running it.

## Test ids and statuses
- Backend: `Class#method`. `Class` is the simple name of the `classname` attribute, so a nested class reads `Outer$Inner`.
- Files: `<repo path> › <suite > ... > title>`. A criterion's `"title"` matches either the whole suite path or the
  leaf title.
- Status:
  - `pass`;
  - `skipped` (also Vitest `pending` and `todo`, and node `todo`);
  - `assertion`:
    - a Surefire `<failure>`, which JUnit, AssertJ and MockMvc raise as an `AssertionError`;
    - a node `<failure>` whose cause is an `AssertionError`;
    - a Vitest failure message that starts with `AssertionError`;
  - `error`: every other failure (a Surefire `<error>`, a `TypeError`, a failed import).

## Run kind
When the run has structured results, its kind is the first that applies:

1. `compile` when the console shows a compile error;
2. otherwise `no-tests` when no test ran (all results are `skipped`, or there are none);
3. otherwise `assertion` when any test has `assertion`;
4. otherwise `error` when any test has `error`, or when the runner exited non-zero with every test passing (infra);
5. otherwise `pass`.

A run with no report is `structured: false` and keeps the console summary. The gate ignores it, and the report table
shows it as unstructured.

## The gate
For each criterion, the gate looks at structured runs of the target and selector that cover the criterion's test, and at
that test's status in each run:

- **red**: the first run where the status is `assertion`;
- **green**: a later run where the status is `pass` and `code` equals the head commit's code fingerprint.

The problem message says what was missing:

- no structured run of that test;
- no assertion red (with the statuses that were seen);
- a later pass exists, but only on older code (stale).

Requiring a green on the head code means the targeted test runs again after the last code change. `dod.mjs`
already re-runs everything; this makes the targeted run, which names the criterion's test, current too.

## Bootstrapping this slice
The recorder is part of this slice. The parser and summary criteria (1-4) were written before a structured red could be
recorded, and criterion 8 (a criterion that names no test) was already enforced by slice 1. So task 3 shows each of
them red by breaking the code it tests, recorded with `test-run.mjs`. Each break is in a path the recorder does not
use itself: breaking the shared `AssertionError` pattern would make the recorder log `error` instead of `assertion`.
Task 3 then restores the code to the same blob ids and records the final green. Slice 4 turns that manual step into a recorded,
replayable workflow.

## Not in this slice
- Fingerprints of the test file between red and green (slice 4 records and compares them).
- Where review evidence comes from (slice 3).
