# ADR-0005: Evidence integrity — no misleading passes

- **Status:** Accepted (slice 1 of 6)
- **Date:** 2026-10-20
- **Deciders:** volodya4u (user), Claude

## Context

The `pr-evidence` gates (ADR-0002, `scripts/pr-evidence.mjs`) are how a pull request proves its loop, but some passes did
not prove anything. In [#72](https://github.com/volodya4u/InventoryManagement/pull/72), slice H1 `harden-security-tests` was an
OpenSpec change, and the **Red → green** gate only read the `docs/specs/` files a branch added. Its ✅ meant "no new spec",
and the test runs listed under it were history that nothing checked. Other rows used the same ✅ for "this does not apply here".

The owner approved a program of six slices, each with its own pull request:

1. explicit gate status;
2. per-test evidence matched to the final code;
3. where review evidence comes from (a reviewer run in CI, and a GitHub review as the human fallback);
4. replayable deliberate-break runs;
5. entry-point tests for the push safeguard;
6. structured owner decisions and trust incidents.

This ADR records slice 1. Later slices extend it.

## Decision (slice 1)

- **Four statuses.** Each gate reports `PASS`, `FAIL`, `N/A` with its reason, or `WAIVED` with each waived item and who
  approved it, through one function (`gateStatus`). Only `FAIL` fails the job. A gate that does not apply is never shown
  as a pass.
- **Red → green follows the criteria, not the file type.** It checks each acceptance criterion that the branch adds or
  changes, either in `docs/specs/*.md` or in the `## Acceptance criteria` table of an `openspec/changes/[archive/]<slice>/proposal.md`.
  A criterion counts as changed when its row text or its named test differs from the merge-base version. A rename (archiving a
  slice) is compared with its old path, so archiving alone asks for no new evidence. A slice proposal that the branch adds
  without a table fails. Otherwise leaving the table out would be the easy way to get a pass.
- **Harness tests can be named**, as `scripts/x.test.mjs` › "title". For now, a harness TestRun of that file covers them.
  Slice 2 matches the test id instead.
- **Waivers are exceptions that stay visible.** A gate waiver is a `docs/qa/waivers/*.md` file that the branch adds. It
  needs `Status: open` (a waiver without it is not open), `Gate: Red → green`, `Criteria: <path> AC<n>, AC<m>` (or
  a path alone, with several paths separated by `;`) and an `Approval:` line.
  `correct.mjs --detect` asks for the owner's disposition, as for any waiver. A waiver must not mention a requirement id
  unless it is meant to waive it.
- **`check-specs.mjs` checks active slice proposals too**: each named test exists and holds the quoted text. In a pull
  request it also checks each proposal the branch adds, even one created straight under `archive/`. Older archived
  slices are not checked, because their tests may since have been renamed.
- `check-specs.mjs` is a locked gate file, so the lock is re-sealed in the same commit, keeping the earlier adaptation
  notes and adding one for this change.

## Consequences

- A hardening slice like #72 now fails the gate unless each criterion has a recorded red, then green run, or an approved
  waiver. Slice 4 adds the break → red → restore → green form for strengthening tests of existing behavior.
- Readers of the report can tell `N/A` from `PASS` at a glance. Tooling that matched on "✅" alone must also accept `➖ N/A`.
