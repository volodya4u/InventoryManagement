# Match test evidence to the exact test and the final code

## Why
Slice 1 made **Red → green** check every acceptance criterion a branch adds or changes. What it accepted as red and
green was still loose:

- `scripts/test-run.mjs` reads the runner's console with regular expressions. It records one `kind` for the whole run
  (`assertion` as soon as any test failed) and no test names.
- `pr-evidence` matches a run to a criterion by class or file. A failure of another method in the same class, or of
  another test in the same spec file, counted as the criterion's red.
- A skipped target test or an exception was not told apart from an assertion failure in every runner.
- The green run's `code` fingerprint was recorded but never compared with the head commit. A green run on older code
  satisfied the gate.

## What Changes
- `scripts/test-run.mjs` asks each runner for a structured report and records every test of the run with its status:
  - backend: the Surefire XML files the run writes;
  - frontend: Vitest's JSON report, through `ng test --reporters json --output-file`;
  - harness: `node --test --test-reporter=junit`.

  A test's id is `Class#method`, or `<file> › <suite > title>` for a file. Its status is one of:
  - `pass`;
  - `assertion` (a failed assertion);
  - `error` (any other exception);
  - `skipped`.

  The run-level `kind` is derived from those results. A run without a report keeps the console summary and is marked
  `structured: false`. The record also keeps the blob id of each test file it ran (`testFiles`), for slice 4.
- The parsers live in a new `scripts/test-results.mjs`, with no dependency.
- In `pr-evidence`, a criterion's red is a structured run where **its own test** has `assertion`. Its green is a later
  structured run where that test has `pass` on the **head commit's code**. If the only green runs are on older code, the
  report calls the green stale. Unrelated failures, skipped tests, errors, compile errors and unstructured runs do not count.
- A criterion that names no test fails. Only gate waivers the branch adds count, and a unit test now pins that rule.
- Leftovers from slice 1's review:
  - `prSpecProblems` diffs with `-M`, so a renamed proposal is not taken for a new one;
  - an active proposal is checked once, not twice;
  - the targeted-runs table shows per-test results and whether the run covers the head commit's code.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given Surefire XML, when it is read, then each test is Class#method, a failure is an assertion, an error is an error and a skipped test is skipped | `scripts/test-results.test.mjs` › "junit: Surefire reports give each test as Class#method, with a failure as assertion, an error as error and a skipped test as skipped" |
| 2 | Given a node:test JUnit report, when it is read, then each test is named by file and title under its suites, and an AssertionError is told from another error | `scripts/test-results.test.mjs` › "junit: node:test reports name each test by file and title, nested under its suites, and tell an AssertionError from another error" |
| 3 | Given a Vitest JSON report, when it is read, then each test is named by file and title, and an AssertionError is told from another error | `scripts/test-results.test.mjs` › "vitest: the JSON report names each test by file and title and tells an AssertionError from another error" |
| 4 | Given a run's test results, when the run is summarized, then its kind comes from them, and a run without results is unstructured | `scripts/test-run.test.mjs` › "structured: a run's kind comes from its test results, and a run with no results is unstructured" |
| 5 | Given a red run where another test of the same class or file failed, when Red → green is checked, then it does not count as the criterion's red | `scripts/pr-evidence.test.mjs` › "red-green: only the criterion's own test counts; a failure of another test in the same class or file does not" |
| 6 | Given a run where the target test was skipped or threw an error, or a run without structured results, when Red → green is checked, then it is not red | `scripts/pr-evidence.test.mjs` › "red-green: a skipped target test, an error or an unstructured run is not red" |
| 7 | Given a green run on older code, when Red → green is checked, then it is stale, and only a green on the head commit's code passes | `scripts/pr-evidence.test.mjs` › "red-green: a green run on older code is stale; the last green must cover the head commit's code" |
| 8 | Given a criterion whose test cell names no test, when Red → green is checked, then it fails | `scripts/pr-evidence.test.mjs` › "red-green: a criterion that names no test fails" |
| 9 | Given waiver files that the branch adds, edits or inherits, when gate waivers are collected, then only the added ones count | `scripts/pr-evidence.test.mjs` › "waivers: only a waiver the branch adds counts" |
| 10 | Given a branch that adds an active proposal or renames one into archive/, when its specs are checked as a pull request, then the active one is reported once and the renamed one is not checked as new | `scripts/check-specs.test.mjs` › "in a pull request, an active slice proposal is checked once, and a renamed proposal is not checked as new" |

## Impact
- Affected specs: none (harness work, no FR rows). The evidence model is in `docs/adr/0005-evidence-integrity.md`.
- Affected code:
  - `scripts/test-run.mjs`;
  - the new `scripts/test-results.mjs`;
  - `scripts/pr-evidence.mjs`;
  - `scripts/check-specs.mjs`, which is locked, so the lock is re-sealed with its notes kept;
  - their tests.
- Records written before this change carry no per-test results, so they no longer count as red or green. Only records
  that a branch adds are read.
- Dependencies: none. No `AGENTS.md`, skill or reviewer change, so the evals do not run.
