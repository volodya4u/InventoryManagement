# Design — improve-PD-2

## Where the gap was
`computeMetrics` in `scripts/ledger-report.mjs` filtered events on `e.event === "not-earned"`, `e.result === "NOT-EARNED"` or
`e.meta?.notEarned`. `gate-status.mjs` writes one `gate-status-run` event per run with `meta.gates`, a map from gate id to
verdict, and nothing else that names NOT-EARNED. Every recorded run therefore counted as zero.

## The rule
For each event, `n = max(number of gates in meta.gates that are NOT-EARNED, 1 if a legacy top-level marker is set else 0)`.
The total is the sum of `n`; `byGate` sums the gate ids. The legacy markers stay because other emitters may use them, and
because an event with a marker but no per-gate data is still one NOT-EARNED fact.

## What it does not do
It is a count for the retro. It does not change `Result`, the exit code, the vacuous-pass count or the ratchet's inputs
(`check-process-ratchet.mjs` reads `vacuousPasses`, `acceptanceCoverage` and `warningsByClass` only).
