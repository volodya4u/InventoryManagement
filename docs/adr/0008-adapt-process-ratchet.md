# ADR-0008: Adapt the process ratchet and say what it can attest

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** volodya4u (user), Claude

## Context

ADR-0001 installed `scripts/check-process-ratchet.mjs` because `gate-status.mjs` calls it. It has reported NOT-EARNED since.
The ratchet has five guards (`openspec/changes/archive/2026-10-28-process-ratchet/design.md`). Its scanner looked for product code and `@trace`
tags in `app`, `src`, `lib`, ... and in `*.test|spec|eval.<js|ts>` files, so it never saw `frontend/src` or the JUnit
classes, and the dead-@trace guard said "no @trace annotations yet". The guards on vacuous passes, acceptance-contract
coverage and warning budgets read `trace/process-health.json`, a digest of the local, gitignored telemetry ledger
(`trace/ledger.jsonl`), and no baseline was committed. The script is gate-locked (`factory-lock.json`).

## Decision

- Adapt the scanner to this layout: `frontend/src` joins the product and test directories, and `*Test.java` / `*Tests.java`
  count as test files. Nothing else in the script changes. Re-seal `factory-lock.json` in the commit that edits it. The
  repository has no `PD-n` process-defect ids, so the owner's approval of the plan is the gate change's authority, as for
  ADR-0002, ADR-0004 and ADR-0006.
- Earn `quality/process-baseline.json` with `--update` from a real local run (`gate-status.mjs`, `ledger-report.mjs`, then
  the ratchet), replacing the unearned template. After that it only tightens; a drop needs a waiver under
  `docs/qa/waivers/` and an owner-signed entry, as the script says.
- Keep the ratchet local. The digest files (`trace/process-health.json`, `docs/qa/process-health.md`,
  `docs/qa/process-defects.json`) are machine-specific and gitignored. Not wired into CI or `dod.mjs`: it reads a ledger
  that CI does not have, and a CI that built its own ledger would attest to itself.
- State what each guard attests here:
  - **Dead-@trace alarm:** attests anywhere (committed tags and `trace/trace.json`).
  - **Vacuous passes and acceptance-contract coverage:** attest only on a machine with a ledger from `gate-status.mjs`;
    elsewhere the ratchet reports NOT-EARNED, which is accurate.
  - **Warning budgets:** count only the warning classes the ledger records. The checks here do not emit their warnings by
    class yet, so this guard sees none and its pass is not evidence about them. The phase is "unknown" (no
    `docs/current-state.md` header), so the strictest band of each budget applies when classes do appear.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Scanner fix, local baseline, no CI step (chosen) | Honest about what is evidence; no new CI dependence | The ledger-based guards are not enforced for a contributor who does not run them |
| Commit the digest (`trace/process-health.json`) | CI could read it | A snapshot of one machine's ledger, not reproducible; churns every run |
| Emit the ledger in CI and ratchet it there | Enforced on every pull request | CI would attest to evidence it just produced |
| Leave the scanner and only commit a baseline | No locked file edit | The dead-@trace guard stays blind to every real tag |

## Consequences

- On a machine that has run the three commands the ratchet reports PASS over four guards; on a fresh clone it reports
  NOT-EARNED for the guards that need the ledger and still runs the dead-@trace guard.
- A change that lowers acceptance-contract coverage or raises vacuous passes fails the local ratchet until it is fixed or
  waived.
- `check-process-ratchet.test.mjs` matches `scripts/check-*.mjs` and joins the lock.
- Giving the other checks `warningsByClass` in the ledger would make the budget guard meaningful; that is future work.
