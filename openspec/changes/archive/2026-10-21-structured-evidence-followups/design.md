# Design — structured-evidence-followups

## Unreadable reports
`vitestTests` returns `null` when the text does not parse as JSON, or when it has no `testResults` array.
`junitTests` returns `null` when the text has no `testsuite`, `testsuites` or `testcase` element, for example an
empty file or a crash mid-write. Either way, `readResults` in `test-run.mjs` returns `null` for the whole run, and
`structuredVerdict` records it `structured: false` with the console summary. Surefire writes one file per class, so
the run's results are `null` only when every file written during the run is unreadable. An unreadable file among
readable ones is skipped.

## Compile error versus a report
The console summary still says `compile` when it sees a compile line. `structuredVerdict` keeps it only when the report
has no non-skipped test. Otherwise the report decides the run's kind. In that case the recorded first failure is left
empty: the console's line was the stray compile line, and no better one is known. When the report itself shows an import failure,
node:test lists it as a failing case of the file, so it reads as `error`.

The case "an old report lying around" is already ruled out:
- `test-run.mjs` deletes the Vitest and JUnit files before each run;
- it reads only the Surefire files written since the run started.

## Ambiguous titles
For a file criterion, a test matches its title when either:
- the test's whole suite path equals the title (`<file> › <title>`); or
- the test's id ends in ` > <title>`.

If several distinct ids in one run match only by their leaf title, that run reports the status `ambiguous` for the
criterion. Ambiguous runs are neither red nor green. The gate's message names the matching ids and asks for distinct
titles. `check-specs.mjs` finds a test by its leaf title in an `it(...)`/`test(...)` call and does not read `describe`
paths, so renaming one of the tests is the fix that fits both checks.

Two cases are not ambiguous:
- the same id listed twice (a runner reporting retries);
- a backend `Class#method(…)[n]` parameterized case, which keeps its current rule.
