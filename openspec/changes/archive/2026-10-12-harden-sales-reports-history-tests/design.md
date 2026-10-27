# Design — harden-sales-reports-history-tests

> Reconstructed on 2026-10-27. The slice was archived without a `design.md`. This file is written from its
> `proposal.md`, `tasks.md` and the merged commit 3ee00f4 (pull request #73, branch
> `claude/harden-sales-reports-history-tests`); it records what that diff shows and nothing the original author did not
> save. See `docs/qa/historical-gaps.md`.

## Approach
Test-only. Seventeen MockMvc tests in `InventoryFlowIntegrationTest`, each tagged `@trace <id>`, with private helpers for
products, sales, returns and JSON posts. Sales, returns and cancellations are set up through the API; stock movements and
production batches through direct SQL. The slice touches the money and stock arithmetic, where the fewest tests pinned
the most behavior. New imports: `MockMvcRequestBuilders.request` and `java.util.ArrayList`.

## Responses pinned as the server sends them
Bean Validation failures on a request body answer 400 titled "Bad Request" (Spring's own problem detail), so the
`validation` handler in `ApiExceptionHandler` is not what answers them.

## A requirement corrected, not the code
FR-132 said the whole ordering chain is descending; the code sorts inventory type ascending (PRODUCT before
RAW_MATERIAL). The requirement and the `stock-history` spec were changed to say so.

## Left open
OQ-2 (should returned sales count on the dashboard) stayed open in this slice; the
OQ-2 row in `docs/requirements.md` holds the owner's answer.

## Red evidence
Each assertion was shown failing against a deliberate break of the production file it guards through
`node scripts/test-run.mjs`, then restored with `git checkout`. The final diff touches no `src/main` file.
