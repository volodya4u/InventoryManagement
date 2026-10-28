# Adapt the process ratchet to this repository

## Why

`node scripts/check-process-ratchet.mjs` (reported by `gate-status.mjs` as `processRatchet`) is NOT-EARNED. Two of its
causes are in this repository, not in the telemetry: its scanner looks for product code and `@trace` tags only in
`app`, `src`, `lib`, ... and in `*.test|spec|eval.(ts|js|...)` files, so it never sees the Angular app under `frontend/src`
or the JUnit classes (`*Test.java`), and it reports "no @trace annotations yet" although the traceability chain joins
hundreds of tags. And no baseline is committed, so a drop in acceptance-contract coverage or a rise in vacuous passes goes
unnoticed.

## What Changes

- **`scripts/check-process-ratchet.mjs`** (gate-locked; the owner approved the edit and the re-seal with the plan): add
  `frontend/src` to the product and test directories and `*Test.java` / `*Tests.java` to the test-file pattern. Nothing
  else in the script changes.
- **`scripts/check-process-ratchet.test.mjs`** (new, locked by the `scripts/check-*.mjs` glob) runs the ratchet on throwaway
  projects with this layout.
- **`quality/process-baseline.json`** is earned with `--update` from a real run (it replaces the unearned template): the
  acceptance-contract coverage, the vacuous-pass count and the warning budgets of `quality/telemetry.config.json`.
- **`.gitignore`**: the local digest `ledger-report.mjs` writes (`trace/process-health.json`, `docs/qa/process-health.md`,
  `docs/qa/process-defects.json`) is machine-specific and stays out of git.
- **`factory-lock.json`** is re-sealed in the same commit; **ADR-0008** records what the ratchet can and cannot attest here.
- Not changed: CI and `node scripts/dod.mjs`. The ratchet reads the local telemetry ledger (`trace/ledger.jsonl`, gitignored),
  which CI does not have, so it is run locally (ADR-0008).

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given `@trace` tags in a Java test class under `src/test/java` that join the traceability chain, when the ratchet runs, then the dead-@trace guard runs and the ratchet passes | `scripts/check-process-ratchet.test.mjs` › "counts @trace tags in Java tests, so the dead-@trace guard runs" |
| 2 | Given `@trace` tags in an Angular spec under `frontend/src`, when the ratchet runs, then the dead-@trace guard runs | `scripts/check-process-ratchet.test.mjs` › "counts @trace tags in frontend specs, so the dead-@trace guard runs" |
| 3 | Given `@trace` tags in a Java test that join nothing in the traceability chain, when the ratchet runs, then it fails with the dead-@trace alarm | `scripts/check-process-ratchet.test.mjs` › "fails when the tags in Java tests join nothing in the traceability chain" |
| 4 | Given source files only under `frontend/src`, when the ratchet runs, then it counts them as product code | `scripts/check-process-ratchet.test.mjs` › "counts frontend/src as product code" |

## Impact

- Affected specs: none (harness work, `skip_specs: true`).
- Affected files: `scripts/check-process-ratchet.mjs` and its test (locked), `factory-lock.json` (re-sealed),
  `quality/process-baseline.json`, `.gitignore`, `docs/adr/0008-adapt-process-ratchet.md`. No CI, no `dod.mjs`.
- The baseline is whatever the local telemetry attests now; see ADR-0008 for what that does and does not cover.
