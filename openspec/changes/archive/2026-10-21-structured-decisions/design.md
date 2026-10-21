# Design — structured-decisions

## Why a checked table, not prose
The questions stay in `docs/requirements.md`, where the requirements they govern are, as one row each. The checker reads
the table by column name, so adding a column later does not break it.

The decision cells (intent, owner, date) are empty for an open question, so a reader, or a model, cannot take a
recommended default for an answer. **Observed behavior** is allowed on every row: it records what the code does, which
is evidence, not a decision.

## What an answer must carry
An answered or ratified row needs all of these:
- an owner;
- a date;
- a reference (the PR or chat the answer came from);
- the intent in the owner's words;
- requirements that exist in the same document;
- tests that exist and carry `@trace` for one of those requirements.

The test check reuses the conventions of `check-specs.mjs`: `Class#method` for a JUnit method under `src/test/java`,
and `file › title` for a Vitest or node:test test. It reads the `@trace` lines just above that test, up to the test
above it (`2026-10-22-decisions-trace-scope`). That is per test, unlike `check-traceability.mjs`, which counts per file.

## Migration
- **OQ-1 and OQ-2:** the old rows had the owner's answer in bold, followed by what the code also does, marked "observed,
  not part of the answer". That split became the two columns. The answer's wording is unchanged, and only "Answered by
  the owner on 2026-10-11" moved into the owner and date cells.
- **Requirements cells:** for each question, the ids it names, plus every FR/NFR row whose text cites it (`see OQ-n`).

## The autonomy log
- **The new columns** go after "Why this level", so `tableCells` still reads the first six by position and older rows
  keep their shape.
- **The gate** checks only rows a branch adds (`newRows`), so the `not recorded` cells of older rows are never judged.
  Back-filling them from memory would be hand-typed claims, which CLAUDE.md forbids.
- **Row 26** is the exception: its Downgrade section is the record.
