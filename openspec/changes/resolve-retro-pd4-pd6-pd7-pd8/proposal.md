# Resolve process retro findings PD-4, PD-6, PD-7 and PD-8

## Why

The 2026-10-28 retro left four process findings open. ADR-0010 subsequently supplied recordings, but G3 still cannot detect loss of their producing mechanism. The dashboard ignores the recorded 2026-10-11 owner ratification of requirements and the capability plan. Traceability warnings do not reach the telemetry ledger. Correction dispositions can claim human approval without a checkable reference. The owner approved work on all four findings in chat on 2026-10-30, including treating the 2026-10-11 ratification as G1 and G3 sign-off.

## What changes

- PD-4: G3 checks for the producer and checker required by its strict-recordings release demand, even though no requirement declares the `recording` verification class.
- PD-6: G1 and G3 recognize the existing explicit ratification statements. If those statements are absent, the gates continue to show `needs sign-off`, and downstream PASS results are recorded as claim divergence without being relabeled.
- PD-7: every traceability run emits one fail-open ledger event with its exit code, scope and warning/failure counts by class.
- PD-8: new `waived` or `resolved` correction dispositions require a verifiable owner approval reference; older dispositions warn until the owner backfills evidence. An agent-typed name or URL alone is not proof.

This changes process gates and their tests, not product behavior. No MVP requirement row or baseline product spec changes.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given G7 requires strict recordings, when the recording producer or checker is absent, then G3 existence fails and names the missing mechanism | `scripts/retro-pd4.test.mjs` |
| 2 | Given the recorded owner ratification of requirements and plan, when gate-status runs, then G1 and G3 show PASS; when the ratification is absent, they show needs sign-off and downstream PASS is recorded as divergence | `scripts/retro-pd6.test.mjs` |
| 3 | Given traceability warnings or failures, when the check runs, then one ledger event records exit status, scope and per-class counts | `scripts/retro-pd7.test.mjs` |
| 4 | Given a new resolved or waived correction without verifiable owner approval, when correct --check runs, then it fails; historical dispositions warn until backfilled | `scripts/retro-pd8.test.mjs` |

## Impact

Gate-locked scripts require an approved `Refs: PD-n` commit under the existing integrity rule. The local process ledger and defect catalog remain gitignored. Existing correction dispositions must not be silently rewritten or treated as proven.
