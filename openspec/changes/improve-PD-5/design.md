# Design — improve-PD-5

## The two problems are one change
Making an unwaived gap fail without a way to waive the two old ones would turn `main` red the moment it merged. Giving a way
to waive them without making new gaps fail would only add an exception to a check that does not yet enforce its own rule. So
the check, the waiver format and the two waivers ship together.

## The waiver format is explicit on purpose
`check-acceptance-methods.mjs` waives every requirement id a waiver mentions, which is convenient for requirements and wrong
for slices: a sentence such as "unlike `2026-10-21-structured-evidence-followups`" would waive it. A slice waiver therefore needs
a `Slices:` line (exact archived folder names, comma separated), a `Gate: Trajectory` line, an `Approval:` line and
`Status: open`. A waiver with no `Status:` line is not open, as for the Red → green waivers in `pr-evidence.mjs`: an
exception must say that it is one. The field reader is a copy of `pr-evidence.mjs`'s `field`, not an import, because both
scripts run on import.

## What a waiver covers
Only the `trailer` and `review-evidence` findings, only for the listed slices. `process` (a missing `design.md` or `tasks.md`)
is repairable and is not waivable. A waived slice that later gains a clean review or a trailer simply stops producing a
finding; the waiver then does nothing and can be closed.

## Reporting
A waived finding is printed as `WAIVED [check] <slice>: ... (waiver: <path>, approval: ...)`, listed in a "Waived" section of
the generated report and in `trace/trajectory.json`, and counted in the final line. It is not a warning, so the normal run
no longer prints the two historical gaps as warnings; they are visible as waived instead, which says more: who approved them
and where.

## Per-slice strictness and archiving
The normal run now fails for an unwaived `trailer` or `review-evidence` finding. A slice's review is read from the pull
request that merged it, so a slice archived in the same pull request as its work reads "missing" until it merges. The
repository already archives in its own pull request after the work merged (#115, #125, #127, #129, #131, #133), which is the
rule in `docs/qa/historical-gaps.md`; the check now enforces it.

## Tests
Fixtures are throwaway git repositories, as in the existing tests of this file. The shared `evidence` helper used `execFileSync`,
which throws on exit 1; it now uses `spawnSync` and reads `trace/trajectory.json`, which the script writes before it exits.
