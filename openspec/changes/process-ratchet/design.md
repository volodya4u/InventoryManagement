# Design — process-ratchet

## What was wrong, and what was not
The ratchet has five guards. Two things stopped it from attesting anything here: the scanner's directory list and test-file
pattern (fixed by this change), and the telemetry the other guards read (not a defect of the scanner; see below). The
scanner fix is two directory entries and a pattern, because every other path the script uses is relative to the repository
root and already right (`trace/trace.json`, `openspec/changes`, `docs/qa/waivers`).

## Which guards attest what
- **Dead-@trace alarm** reads the `@trace` tags in test files and `trace/trace.json`, both committed. With the scanner fix it
  runs anywhere, CI included.
- **Vacuous passes, acceptance coverage and warning budgets** read `trace/process-health.json`, which `ledger-report.mjs`
  derives from `trace/ledger.jsonl`. The ledger is soft, fail-open telemetry that `gate-status.mjs` appends to on a machine
  that runs it, and it is gitignored (`.githooks/pre-commit` switches it off on purpose). So these three guards can attest
  only where that evidence exists: a local run of `gate-status.mjs`, then `ledger-report.mjs`, then the ratchet. Elsewhere
  the ratchet says NOT-EARNED, which is the true answer.
- **The warning-budget guard** counts the warning classes the ledger records. The checks here do not yet emit their warnings
  by class, so it sees none and its pass is not evidence about the recording-evidence warnings or any other class. This is
  recorded in the ADR and not hidden by a threshold.

## Why not wire it into CI or the Definition of done
A step that needs a local ledger is red or silent on a fresh clone, and a CI that regenerates its own ledger would attest to
itself. The honest wiring is the one the tool was designed for: run the three commands locally before a release or a change
to the process, and commit the baseline only from a run that was green.

## The baseline
`--update` writes the acceptance coverage, the vacuous-pass count and the budgets from `quality/telemetry.config.json`, and
only in the tightening direction afterwards (a drop needs a waiver artifact under `docs/qa/waivers/`). The phase is "unknown"
because the repository has no `docs/current-state.md` header, so the strictest band of each budget applies; no phase is
invented to loosen it.
