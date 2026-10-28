# ADR-0009: Waive the two unrepairable trajectory gaps, and fail new ones

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** volodya4u (user), Claude

## Context

`scripts/check-trajectory.mjs` (gate-locked) turned a missing `Slice:` trailer or a missing clean review of an archived slice
into a warning, and into a failure only under `--release`. `docs/qa/historical-gaps.md` records two such gaps that cannot be
repaired afterwards (a trailer missing from a merged commit, and a review that does not match the merged tree), and says no
new slice may have one. The process retro of 2026-10-28 (finding PD-5) pointed at two consequences. A new gap of the same kind
still left G4 green, so the rule had no enforcement. And the release gate G7 could never pass: a waiver could name a
requirement id but not a slice, so the two documented gaps were red in `--release` with no approved way to clear them.

## Decision

- **A slice waiver.** A `docs/qa/waivers/*.md` file with `Status: open`, `Gate: Trajectory`, an `Approval:` line and a
  `Slices:` line (exact archived folder names) waives the `trailer` and `review-evidence` findings of those slices, and only
  those. A mention of a slice, or a requirement id, waives nothing.
- **A waived finding is reported, not hidden.** It prints as `WAIVED` with the waiver's path and approval, in the console, in a
  "Waived" section of `docs/qa/trajectory-report.md` and in `trace/trajectory.json`, in both modes.
- **An unwaived finding fails in every mode,** not only under `--release`. `process` (a missing `design.md` or `tasks.md`) and
  the scope checks keep their gating.
- **Two waivers,** one per documented gap, ship in the same pull request, each with a correction (COR-6, COR-7) that the
  owner dispositioned. Shipping the check without them would have turned `main` red.
- **The lock is re-sealed** in the commit that edits `scripts/check-trajectory.mjs`, keeping the earlier adaptation notes and
  adding one. The repository has no `PD-n` approval flow beyond the trailer, so the owner's request to do PD-5 and the waivers is
  the gate change's authority, as for ADR-0002, ADR-0004, ADR-0006 and ADR-0008.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Slice waivers with an explicit `Slices:` line (chosen) | Precise; visible as WAIVED; reuses the waiver folder and the correction flow | One more waiver format |
| Waive by mention, as requirement waivers do | No new format | A sentence naming a slice would waive it by accident |
| Drop the two slices from the check by a list in the script | No waiver files | Hidden in a locked script, no approval line, no correction |
| Rewrite history to add the trailer and a review | Gap disappears | Rewrites merged history, which this repository never does |
| Leave per-slice as a warning | No behaviour change | A new gap still passes G4 |

## Consequences

- G7's trajectory part can pass: `node scripts/check-trajectory.mjs --release` exits 0 with two WAIVED lines. G7 still has
  its other reasons (no recording manifests).
- A slice that is archived with a missing trailer or without an approved review now fails the normal run, the pre-commit hook
  and `node scripts/dod.mjs`. Because a slice's review is read from the pull request that merged it, archive a slice in its own
  pull request after the work has merged, as #115, #125, #127, #129, #131 and #133 did.
- The normal run no longer prints the two historical gaps as warnings; they appear as WAIVED instead, with the approver.
- `docs/qa/historical-gaps.md` points at the waivers. The waivers stay open until the owner decides otherwise.
- The waivers' corrections carry the owner's disposition as recorded in chat by the agent, the same kind of record as COR-1 to
  COR-5. Retro finding PD-8 (a verifiable approval reference) is still open.
