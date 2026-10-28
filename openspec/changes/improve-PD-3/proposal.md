# Improvement: improve-PD-3 — the digest tells waived contracts from tested ones

- **Defect:** PD-3 from the process retro of 2026-10-28 (`process-auditor`; `docs/qa/process-defects.json` is local per
  ADR-0008, so this file is the committed record). Class `label-drift`, P1.
- **Approval:** volodya4u approved PD-3 in chat on 2026-10-28 ("start step 1": PD-2, PD-3 and PD-9 in one pull request).
  The commit that carries the fix ends with `Refs: PD-3`.

## Why

The digest wrote `acceptanceCoverage: covered 169 / declared 169` although five contracts are waived (NFR-15, 16, 17, 18 and
20 have no test or no mechanism), because `covered` adds waived contracts to the tested ones. It also wrote `Waivers: 3`
while five `docs/qa/waivers/*.md` files are open: the waived-contract count is read from `trace/acceptance-contracts.json`,
which `check-acceptance-methods.mjs` rewrites on every run in the mode it last ran (three waived in `--mode=existence`,
five in `--mode=artifact`), so the number depends on which check ran last.

## What Changes

- **`scripts/ledger-report.mjs`** (not in the integrity lock): `acceptanceCoverage` keeps `covered` and `declared` exactly as
  they are and adds `tested` (contracts with a passing mechanism or artifact), `waived` and `uncovered`. `covered` stays
  because `check-process-ratchet.mjs` and `quality/process-baseline.json` read it as `tested + waived`; making it smaller
  would trip the ratchet. The draft proposed replacing it; the additive form keeps the label honest without that side effect.
- The waiver total counts the open `docs/qa/waivers/*.md` files (a `Status:` of closed, resolved, expired, revoked,
  withdrawn or done does not count; a file with no status counts as open), as `check-acceptance-methods.mjs` reads them.
  `waivers.files` is new; `waivers.total` is the ledger events plus those files, in place of the contract count that
  depended on the mode.
- The Markdown digest prints `tested`, `waived` and `uncovered` beside `covered`.
- **`scripts/ledger-report.test.mjs`** gets three tests.
- Not changed: `gate-status.mjs`'s `acceptanceArtifact PASS (169)` line (a locked file; a separate proposal if you want
  it to read `PASS (164) · WAIVED (5)`), and `quality/process-baseline.json`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given three contracts, two with a passing artifact and one waived, when ledger-report runs, then `acceptanceCoverage` has tested 2, waived 1, uncovered 0, and `covered` stays 3 | `scripts/ledger-report.test.mjs` › "counts a waived contract as waived, not tested" |
| 2 | Given two open waiver files, when ledger-report runs, then `waivers.files` is 2 and `waivers.total` is 2 | `scripts/ledger-report.test.mjs` › "counts every open waiver file" |
| 3 | Given one open and one closed waiver file, when ledger-report runs, then only the open one is counted | `scripts/ledger-report.test.mjs` › "ignores closed waivers" |

## Expected metric movement

- **Metric:** `acceptanceCoverage`, `waivers.total` in `trace/process-health.json`.
- **Current:** `covered 169 / declared 169`, `waivers.total 3`. **After:** `covered 169` unchanged, `tested`/`waived` split
  (`166 / 3` after an `--mode=existence` run, `164 / 5` after `--mode=artifact`, because the contracts file is rewritten by
  whichever mode ran last) and `waivers.total 5`, the open waiver files, whichever mode ran.

## Rollback

One commit, `git revert <sha>`; then regenerate the local digest with `node scripts/ledger-report.mjs`.

## Impact

- Affected files: `scripts/ledger-report.mjs`, `scripts/ledger-report.test.mjs`, this change folder. No locked file.
