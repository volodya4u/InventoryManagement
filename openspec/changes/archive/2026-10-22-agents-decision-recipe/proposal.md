# Point AGENTS.md at the owner-decision recipe

## Why
Slice 6 of the evidence-integrity plan (#103, `structured-decisions`, ADR-0005) made an owner's answer to an open
question a checked record, and wrote the path it follows in `openspec/project.md` ("Owner decisions": the row, then
the requirement and its spec, then a `@trace` test). `AGENTS.md`, which every agent reads first, still said only
"record the owner's answer in its row". Slice 6 left that line alone because changing `AGENTS.md` needs an eval run.

## What Changes
- **`AGENTS.md`** (Project Factory › Requirements): an answer follows "Owner decisions" in `openspec/project.md`, and
  `scripts/decisions.mjs` checks the row.
- **The eval copies**: `node scripts/factory-rules-evals.mjs` refreshes the Project Factory section embedded in each
  `evals/factory-rules/` case, and `node scripts/eval-record.mjs` records new scores in `evals/record.json`.
- **A test** in `scripts/decisions.test.mjs` keeps the pointer and the recipe linked: it fails when `AGENTS.md` stops
  naming the recipe and the check, or when the "Owner decisions" heading in `openspec/project.md` goes away.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given the Project Factory section of `AGENTS.md`, when an agent reads how to record an owner's answer, then it is sent to "Owner decisions" in `openspec/project.md` and told that `scripts/decisions.mjs` checks the row, and that section exists | `scripts/decisions.test.mjs` › "AGENTS.md sends an owner's answer through the decisions recipe and its check" |

## Impact
- Affected specs: none (agent rules and the harness).
- Affected code: `AGENTS.md`, the `evals/factory-rules/` prompts (generated), `evals/record.json` (generated) and
  `scripts/decisions.test.mjs`. No locked gate file changes.
