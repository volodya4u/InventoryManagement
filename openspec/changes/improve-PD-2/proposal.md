# Improvement: improve-PD-2 — the digest counts NOT-EARNED gates

- **Defect:** PD-2 from the process retro of 2026-10-28 (`process-auditor`; `docs/qa/process-defects.json` is local per
  ADR-0008, so this file is the committed record). Class `check-too-weak`, P1.
- **Approval:** volodya4u approved PD-2 in chat on 2026-10-28 ("start step 1": PD-2, PD-3 and PD-9 in one pull request).
  The commit that carries the fix ends with `Refs: PD-2`.

## Why

The process-health digest printed `NOT-EARNED events | 0` while the dashboard printed `G6 NOT-EARNED`. The digest counts an
event as NOT-EARNED only when the event has a top-level `event: "not-earned"`, `result: "NOT-EARNED"` or
`meta.notEarned`. The `gate-status` events this repository writes carry none of those: they put each gate's verdict in
`meta.gates` (`{"G6": "NOT-EARNED", ...}`), which the digest never reads. The draft allowed that the emitter might carry no
per-gate data; it does, so the defect is in the digest and not in `gate-status.mjs`.

## What Changes

- **`scripts/ledger-report.mjs`** (not in the integrity lock) counts, per event, the gates whose verdict in `meta.gates` is
  `NOT-EARNED`. An event with a top-level NOT-EARNED marker and no per-gate data still counts once. `notEarned` gains
  `byGate`, and the Markdown digest shows the per-gate counts next to the total.
- **`scripts/ledger-report.test.mjs`** gets three tests.
- Not changed: how NOT-EARNED affects the digest's `Result` (it does not), the vacuous-pass count, `gate-status.mjs`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given one gate-status event whose gate G6 is NOT-EARNED, when ledger-report runs, then `notEarned.count` is 1 and `notEarned.byGate.G6` is 1 | `scripts/ledger-report.test.mjs` › "counts a per-gate NOT-EARNED inside a gate-status event" |
| 2 | Given two events that each have G6 NOT-EARNED, when ledger-report runs, then `notEarned.count` is 2 | `scripts/ledger-report.test.mjs` › "counts NOT-EARNED per run" |
| 3 | Given an event in which every gate is earned, when ledger-report runs, then `notEarned.count` is 0 | `scripts/ledger-report.test.mjs` › "reports zero NOT-EARNED when every gate is earned" |

## Expected metric movement

- **Metric:** `notEarned.count` in `trace/process-health.json`.
- **Current:** 0 on this repository, while G6 is NOT-EARNED in every recorded run. After: one per recorded run until G6 is
  earned. It is information for the retro; it changes no verdict and no exit code.

## Rollback

One commit, `git revert <sha>`; then regenerate the local digest with `node scripts/ledger-report.mjs`.

## Impact

- Affected files: `scripts/ledger-report.mjs`, `scripts/ledger-report.test.mjs`, this change folder. No locked file.
