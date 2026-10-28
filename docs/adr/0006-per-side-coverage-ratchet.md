# ADR-0006: Ratchet backend and frontend coverage separately

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** volodya4u (user), Claude

## Context

ADR-0001 installed `scripts/check-coverage-ratchet.mjs` because `gate-status.mjs` calls it, and recorded it as not
applicable: the repository produced no coverage. G5 has shown NOT-EARNED with scope 0 since. The ratchet reads one
istanbul-style summary (`coverage/coverage-summary.json`) against one baseline; this repository has a Java backend and an
Angular frontend whose coverage tools write different formats. Both scripts are gate-locked (`factory-lock.json`).

## Decision

- Collect coverage on both sides: JaCoCo in `mvn verify` (its runtime agent on Surefire's `argLine` with a relative output
  file, because `prepare-agent`'s absolute one breaks `-javaagent` under a non-ASCII checkout path on Windows), Vitest's V8
  provider through `ng test --coverage` (`openspec/changes/archive/2026-10-27-coverage-ratchet/design.md`).
- Keep one ratchet script and give it options (`--summary`, `--baseline`, `--label`, `--require`); the defaults are
  unchanged. Each side has its own baseline under `quality/`.
- Enforce the ratchet in CI (`build-and-test`) and in `node scripts/dod.mjs` with `--require`; `gate-status.mjs` reports both
  sides under G5 without it.
- Re-seal `factory-lock.json` in the commit that edits `check-coverage-ratchet.mjs` and `gate-status.mjs`. The repository
  has no `PD-n` process-defect ids, so the owner's approval of this plan is the gate change's authority, as for ADR-0002
  and ADR-0004.
- To loosen a floor on purpose, add `docs/qa/waivers/<name>.json` with
  `{"check": "coverage-ratchet:<backend|frontend>", "metrics": [...], "reason": "..."}` and run `--update`; to raise it,
  run `--update` after the improvement and commit the baseline.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Per-side baselines through ratchet options (chosen) | A drop on either side fails; one script | Two locked files change; lock re-sealed |
| One merged summary from an unlocked converter | No locked file changes | Java lines dominate the totals, so a frontend drop can hide behind a backend gain |
| Dashboard only (no CI step) | No CI time | Nothing stops a drop; G5 would only report |
| Absolute thresholds (`coverageThresholds`, JaCoCo `check`) | Built into the tools | A fixed number someone picks by hand; does not ratchet up |

## Consequences

- G5 can pass once both baselines exist and both summaries are on disk.
- A pull request that lowers any coverage metric on either side fails CI and the DoD until the tests come back, or until
  a waiver names the metric and `--update` lowers the committed baseline (the compare run never reads waivers).
- The baselines are named `quality/coverage-<side>-baseline.json` so `check-factory-integrity.mjs` locks them in its
  quality tier (`-baseline.json`): a hand edit shows as drift, and only `--update` rewrites them.
- Every `mvn verify` writes a JaCoCo report, and CI's frontend test step runs with coverage, which adds some time.
- `check-coverage-ratchet.test.mjs` matches `scripts/check-*.mjs` and joins the lock.
