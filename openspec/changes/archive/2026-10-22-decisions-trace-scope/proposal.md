# Read a decision test's @trace from its own lines only

## Why
The review of slice 6 (#103, `structured-decisions`, ADR-0005) approved it and noted one gap in `scripts/decisions.mjs`.
To decide whether a linked test holds an owner decision, it read a fixed window: the 7 lines above the test's
declaration, plus the declaration. That window can reach into the test above. So a short test tagged `// @trace FR-81` directly above an untagged one made the
untagged one count as tracing FR-81, and an answered question could pass with a test that does not hold its decision.

The slice's design also said the check reads the tags "as `check-traceability.mjs` counts them", but that script
counts `@trace` per file, not per test.

## What Changes
- **The scan stops at the test above.** `traceIds` walks up from the declaration, at most 8 lines, and stops at a line
  that closes a block (it starts with `}`) or declares another test (`void name(`, or `it(` or `test(` with any
  modifier such as `it.skip(` or `test.todo(`). A comment line never stops it, even when it mentions `test(` in prose.
  The comments and annotations between a test's own tag and its declaration still count.
- **The design note** in `openspec/changes/archive/2026-10-21-structured-decisions/design.md` says the tag is read per
  test, unlike `check-traceability.mjs`, which counts per file.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given an untagged test directly below a tagged one, in a JUnit class or a spec file (a plain, skipped, focused or todo test), when an answered question links it, then it does not hold the decision, while a test's own tag above its annotations and comments, prose comments included, still counts | `scripts/decisions.test.mjs` › "a test's @trace is read from its own lines, never from the test above it" |

## Impact
- Affected specs: none (the harness only).
- Affected code: `scripts/decisions.mjs` and its test, and one sentence of the archived slice 6 design. No locked gate
  file changes.
