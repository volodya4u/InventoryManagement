# Close the follow-ups of structured test evidence

## Why
The review of slice 2 (`structured-test-evidence`, #92) left three gaps in how a run's per-test results are read and
matched:

- **A broken report looked like an empty one.** If the Vitest JSON report is not valid JSON, `vitestTests` returned
  `[]`, so the run was recorded `structured: true` with kind `no-tests` and hid the console verdict. An empty or
  truncated node:test JUnit file did the same.
- **A stray compile line overrode a valid report.** The console summary flags `compile` on any line with
  `SyntaxError`, `ERR_MODULE_NOT_FOUND` or "does not provide an export named". That includes such a line printed by a
  child process inside a test. The run then threw away a valid per-test report.
- **A shared title matched two tests.** A criterion named by its leaf title matched every test with that leaf title in
  the file, so two `describe` blocks with the same `it` title both counted. An assertion in the other one counted as the
  criterion's red.

## What Changes
- A report that cannot be read gives no results (`null`). The run is then recorded `structured: false`, keeps the
  console summary, and does not count. This applies to Vitest JSON that does not parse, and to node:test or Surefire
  text with no `testsuite` or `testcase` element.
- A report that lists tests wins over a compile error found in the console. The console's `compile` stands only when
  the report has no test in it, or when there is no report.
- A criterion title that matches the leaf title of more than one distinct test in a run is ambiguous. That run does not
  count for the criterion, and the gate says which tests share the title and asks for distinct titles. A title that
  equals a test's whole suite path (`Suite > title`) still matches only that test.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a Vitest report that is not valid JSON, or JUnit text with no test element, when it is read, then it gives no results, so the run is unstructured | `scripts/test-results.test.mjs` › "a report that cannot be read gives no results, so the run is unstructured" |
| 2 | Given a report that lists tests and a console that mentions a compile error, when the run is summarized, then the report's results stand | `scripts/test-run.test.mjs` › "structured: a report that lists tests wins over a compile error the console mentions" |
| 3 | Given two tests in one file that share a leaf title, when a criterion names that title, then the run does not count and the gate asks for distinct titles | `scripts/pr-evidence.test.mjs` › "red-green: a title that two tests in one file share is ambiguous and does not count" |

## Impact
- Affected specs: none. This is harness work with no FR rows. The evidence model is in
  `docs/adr/0005-evidence-integrity.md`.
- Affected code: `scripts/test-results.mjs`, `scripts/test-run.mjs`, `scripts/pr-evidence.mjs` and their tests. No locked
  gate file changes.
- Dependencies: none. No `AGENTS.md`, skill or reviewer change, so the evals do not run.
