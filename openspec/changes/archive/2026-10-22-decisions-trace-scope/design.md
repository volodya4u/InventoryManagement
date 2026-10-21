# Design — decisions-trace-scope

## Where the scan stops
`traceIds` used to read a fixed window: the 7 lines above a test's declaration, plus the declaration line. It now walks
up from the declaration, at most 8 lines, and stops before the first line that ends the test above:

- a line that starts with `}` (the end of a JUnit method, or `});` after a Vitest or node:test test);
- a line that declares another test: `void name(` in Java, `it(` or `test(` in a spec file, with any modifier chain
  (`it.skip(`, `it.only(`, `test.todo(`). This catches a one-line test such as `it('tagged', () => {});`, which has no
  line of its own that starts with `}`.

A comment line (`//`, `/*` or `*`) never stops the scan, so a note such as "mirrors the backend test(s)" between a
test's own tag and its declaration does not cut the tag off. Comments and annotations between a test's own tag and its
declaration still count, as do several tags on one test.

## Considered and left out
- **Stopping at `@Test`.** The reviewer named it as an option, but in this repository the tag sits above `@Test`
  (`// @trace FR-81`, then `@Test`, then the method), so stopping there would drop every test's own tag.
- **A multi-line annotation that ends in `})`**, such as `@CsvSource({ … })` between the tag and the method, would also
  stop the scan. A scan of the repository's test files found no tag cut that way (none of the 223 tags), so the rule is
  kept simple; a tag written below such an annotation still counts.

## Per test, not per file
`check-traceability.mjs` counts a requirement as tested when any test file carries its `@trace`. A decision needs a
specific test to hold it, so `decisions.mjs` reads the tag of the linked test itself. The slice 6 design now says so
instead of "as `check-traceability.mjs` counts them".
