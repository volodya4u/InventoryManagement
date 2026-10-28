# Teach the test-first-loop skill the controlled break

## Why

The `test-first-loop` skill describes red → green only. ADR-0005 (slice 4) added the controlled break for a test that pins
behaviour that already exists, and recorded "Not yet: the skill still describes only red → green. Changing it needs a paid
eval run, so CLAUDE.md carries the how-to for now." An agent that follows the skill alone, on a hardening slice, has no
recorded way to show a test red and may fall back to an unrecorded hand edit or to loosening the test.

## What Changes

- **`.agents/skills/test-first-loop/SKILL.md`** (step 2): a test that only pins existing behaviour is marked `Kind: hardening`
  in the slice's `proposal.md` and shown red with `break-run.mjs start | break | restore`; the break edits the code under
  test, never a test or its fixtures; `docs/evidence/break-runs/<run-id>/` is committed and replayed with
  `break-replay.mjs`. The same rule joins the "Exits" list. Version 1.0 → 1.1.
- **Two eval cases** under `.agents/skills/test-first-loop/evals/`: `hardening-uses-break-run` (the plan uses the recorded
  sequence) and `break-never-touches-tests` (a suggestion to flip the test's expected value is refused).
- **The synced copy** in `.claude/skills/` (`node scripts/skills-sync.mjs`) and **`evals/record.json`** (`node
  scripts/eval-record.mjs`).
- **A test**, `scripts/test-first-loop-skill.test.mjs`, keeps the recipe linked to the scripts it names.
- **ADR-0005**: the "Not yet" bullet says the skill now carries the recipe. `CLAUDE.md` keeps its copy (changing it is
  the owner's call).

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given the `test-first-loop` skill, when an agent reads how to show a test red for existing behaviour, then it is sent to `Kind: hardening` and `break-run.mjs start`, `break` and `restore`, told a break never edits a test or its fixtures, and told to commit the run's evidence and replay it with `break-replay.mjs`; the scripts it names exist | `scripts/test-first-loop-skill.test.mjs` › "the skill sends a test that pins existing behaviour through the recorded controlled break" |
| 2 | Given the canonical skill in `.agents/skills/`, when the Claude copy is read, then it is identical | `scripts/test-first-loop-skill.test.mjs` › "the Claude copy of the skill is the synced canonical one" |

## Impact

- Affected specs: none (agent rules and the harness).
- Affected code: `.agents/skills/test-first-loop/` and its `.claude/skills/` copy, `evals/record.json` (generated),
  `scripts/test-first-loop-skill.test.mjs`, `docs/adr/0005-evidence-integrity.md`. No locked gate file changes.
- The eval run is paid and non-deterministic; its scores are in `evals/record.json` and the `pr-evidence` **Evals** table,
  not restated here.
