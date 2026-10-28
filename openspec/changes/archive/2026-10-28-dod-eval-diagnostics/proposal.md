# Show why the eval ratchet step failed in the Definition of done

## Why

`node scripts/dod.mjs` runs `eval-summary.mjs --check` and then `check-eval-ratchet.mjs` as one step and judges their
combined output with `evalRatchetVerdict`. When `eval-summary.mjs --check` fails (a stale `evals/results/latest.json`, a
missing baseline), the ratchet never runs, the output has no `Result:` line, and the evidence table says only "the eval
ratchet gave no result, not PASS". The reason the script printed is in the captured output but is dropped.

## What Changes

- **`scripts/dod-checks.mjs`**: when the output has no `Result:` line, `evalRatchetVerdict` appends the first non-empty line
  of the output to its message, so the table carries the script's own reason. A verdict that has a `Result:` line, and a
  PASS, are unchanged.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given eval step output with no `Result:` line, when the Definition of done judges it, then the verdict fails and quotes the first line of that output | `scripts/dod-checks.test.mjs` › "eval ratchet verdict quotes the script's reason when there is no result" |

## Impact

- Affected specs: none (harness work, `skip_specs: true`).
- Affected files: `scripts/dod-checks.mjs` and `scripts/dod-checks.test.mjs`. No locked file, no CI change.
