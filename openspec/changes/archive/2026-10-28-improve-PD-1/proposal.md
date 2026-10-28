# Improvement: improve-PD-1 — ledger-report sees this repository's product code

- **Defect:** PD-1 from the on-demand process retro of 2026-10-28 (`process-auditor`, plain subagent;
  `docs/qa/process-defects.json` is local per ADR-0008, so this file is the committed record). Class `vacuous-pass`, P0.
- **Approval:** volodya4u approved PD-1 in chat on 2026-10-28. The commit that carries the fix ends with `Refs: PD-1`.

## Why

`node scripts/ledger-report.mjs` decides on its own whether the repository has product code, and it answers "no" here:
`trace/process-health.json` has `"productCodePresent": false` while `gate-status.mjs` prints
`G6 NOT-EARNED ... (emptiness over product code)` on the same tree. Its walk stops four directories below `src/`, and every
Java source sits deeper (`src/main/java/com/flowershop/inventory/...`). It also counts test files as product code, which
`gate-status.mjs` does not.

What that answer controls (checked in the code, which narrows the auditor's description): the vacuous-pass count reads each
ledger event's own `meta.productCode`, which `gate-status.mjs` writes, so that count was not blind. The digest's own answer
decides what an **empty** ledger means. With product code it is `NOT-EARNED`, exit 1 ("telemetry never ran on a real
build"); without it is `SKIP-pending`, exit 0 ("pre-build emptiness"). So on a clone of this repository with no ledger yet,
the digest exits 0 and calls a populated codebase "pre-build": a pass over absent evidence, which is P0 by the auditor's
rubric. The `productCodePresent` field is also wrong in every digest.

## What Changes

- **`scripts/ledger-report.mjs`** (not in the integrity lock): `productCodePresent()` applies the rule of
  `hasProductCode()` in `scripts/gate-status.mjs` (the same directories and extensions, no depth limit, `.test.` /
  `.spec.` files excluded) instead of its own. The rule is mirrored, not imported: `gate-status.mjs` is locked and runs
  on import, and moving the rule to a shared module would change a locked file under a second defect. The test runs both
  scripts on the same trees, so the two cannot drift apart unnoticed.
- **`scripts/ledger-report.test.mjs`** (new) runs `ledger-report.mjs`, and `gate-status.mjs` for the comparison, in
  throwaway projects.
- Not changed: the vacuous-pass, NOT-EARNED and waiver metrics (PD-2, PD-3), the ledger emitters (PD-7), CI, `dod.mjs`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given product sources only deeper than four directories under `src/` and no ledger, when ledger-report runs, then it reports NOT-EARNED and exits 1 | `scripts/ledger-report.test.mjs` › "reports NOT-EARNED for an empty ledger over Java sources deep under src" |
| 2 | Given that tree, when ledger-report runs, then `trace/process-health.json` records `productCodePresent: true` | `scripts/ledger-report.test.mjs` › "records product code present for Java sources deep under src" |
| 3 | Given a tree with deep Java sources, one with only test files under `src/`, and an empty one, when ledger-report and gate-status run on each, then ledger-report's `productCodePresent` equals the `productCode` that gate-status records in its ledger event | `scripts/ledger-report.test.mjs` › "agrees with gate-status on product-code presence" |
| 4 | Given only test files under `src/` and no ledger, when ledger-report runs, then it reports SKIP-pending and exits 0 | `scripts/ledger-report.test.mjs` › "keeps SKIP-pending for an empty ledger when src holds only tests" |

## Expected metric movement

- **Metric:** `productCodePresent` in `trace/process-health.json`: `false` → `true` on this repository.
- **Empty ledger on this repository:** `SKIP-pending`, exit 0 → `NOT-EARNED`, exit 1.
- **Not expected to move:** `vacuousPasses` (it reads the events' own `meta.productCode`; the retro's draft predicted a
  rise, which the code does not support).

## Rollback

One commit, `git revert <sha>`; then regenerate the local digest with `node scripts/ledger-report.mjs`.

## Impact

- Affected specs: none (harness work, `skip_specs: true`).
- Affected files: `scripts/ledger-report.mjs`, `scripts/ledger-report.test.mjs`, this change folder,
  `docs/autonomy-log.md`. No locked file, so no re-seal.
