# Improvement: improve-PD-9 — auto-waiver corrections name their requirement and gate

- **Defect:** PD-9 from the process retro of 2026-10-28 (`process-auditor`; `docs/qa/process-defects.json` is local per
  ADR-0008, so this file is the committed record). Class `skipped-convention`, P2.
- **Approval:** volodya4u approved PD-9 in chat on 2026-10-28 ("start step 1": PD-2, PD-3 and PD-9 in one pull request).
  The commit that carries the fix ends with `Refs: PD-9`.

## Why

`node scripts/correct.mjs --detect` writes one correction for every file under `docs/qa/waivers/`, always with
`mappedReqIds: []`, `gateThatShouldHaveCaught: null` and `failureMode: "skipped-convention"`. The waiver file names the
requirement and says why it is waived, so a correction cannot be joined to the requirement or the gate that should have caught
it, and a waiver for a check that does not exist (NFR-17, 18, 20) is filed as a skipped convention rather than a missing check.

## What Changes

- **`scripts/correct.mjs`** (not in the integrity lock): the waiver detector reads the file and sets, on the event it hands to
  `--detect` (and to `gate-status.mjs`, which only uses the event's `autoKey`):
  - `mappedReqIds`: the `FR-`, `NFR-` and `BC-` ids the waiver names, once each, in order (the correction schema accepts no
    other prefix);
  - `failureMode`: `missing-check` when the waiver says the verification mechanism does not exist ("has no mechanism"),
    otherwise `skipped-convention`;
  - `gateIds`: `G3` for a missing mechanism (the existence check of the acceptance methods) and `G4` for a missing test (the
    artifact check). The draft named the scripts; the schema accepts gate ids `G0` to `G8` only.
  A waiver that names no id keeps today's values.
- **`scripts/correct.test.mjs`** (new) runs `--detect` on throwaway projects.
- Not changed: the five corrections already recorded (COR-1 to COR-5). `--detect` never rewrites a recorded correction; filling
  them in is a separate, reviewed edit of `retro/corrections/` that the owner can ask for. Approval references (PD-8).

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a waiver for NFR-17 that says it has no mechanism, when `--detect` runs, then the correction maps `NFR-17`, has failureMode `missing-check` and gate `G3` | `scripts/correct.test.mjs` › "maps a no-mechanism waiver to its id and the existence gate" |
| 2 | Given a waiver for NFR-15 that says no test asserts it, when `--detect` runs, then the correction maps `NFR-15`, has failureMode `skipped-convention` and gate `G4` | `scripts/correct.test.mjs` › "maps a missing-test waiver to the artifact gate" |
| 3 | Given a waiver that names two requirement ids, when `--detect` runs, then the correction maps both | `scripts/correct.test.mjs` › "maps every id a waiver names" |
| 4 | Given a waiver that names no requirement id, when `--detect` runs, then the correction keeps empty `mappedReqIds`, a null gate and `skipped-convention` | `scripts/correct.test.mjs` › "keeps the old values for a waiver that names no requirement" |

## Expected metric movement

- **Metric:** auto-waiver corrections with empty `mappedReqIds` or a null gate. New ones: none for a waiver that names a
  requirement. The existing five stay as they are.

## Rollback

One commit, `git revert <sha>`. Corrections written in the meantime keep their (richer) fields; they remain valid.

## Impact

- Affected files: `scripts/correct.mjs`, `scripts/correct.test.mjs`, this change folder. No locked file.
