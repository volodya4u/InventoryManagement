# Design — harden-product-and-production-tests

> Reconstructed on 2026-10-27. The slice was archived without a `design.md`. This file is written from its
> `proposal.md`, `tasks.md` and the merged commit 6eb52fe (pull request #75, branch
> `claude/harden-product-production-tests`); it records what that diff shows and nothing the original author did not
> save. See `docs/qa/historical-gaps.md`.

## Approach
Test-only. Ten MockMvc tests in `InventoryFlowIntegrationTest`, each tagged `@trace <id>`, plus private helpers for raw
materials, the multipart product form and JSON posts. Setup goes through the API for products, production and
adjustments, and through direct SQL for raw materials and for products in a state the API cannot reach (a product with
no recipe). The only new import is `java.util.LinkedHashMap`, from a package the file already uses.

## Responses pinned as the server sends them
Constraint failures on the multipart product form (length limits, quantity digits, recipe items) answer 400 titled
"Validation error" from the `ApiExceptionHandler` handler, while JSON bodies (slice H4) answer "Bad Request". The tests
pin what is returned. OQ-1 (a stored selling price does not follow a cost change) stays out of scope.

## Two assertions that are weaker than the rest
- An unknown raw material in an updated recipe answers 404 from two places (the recipe check, then the price
  calculation), so deleting the recipe check alone does not turn that assertion red.
- The cascade that deletes a product's recipe, batches and movements lives in `schema.sql`, so its test could not be
  shown red without editing that guarded file.

Both limits were noted in the slice's autonomy-log row.

## Red evidence
Each assertion was shown failing against a deliberate break of the production file it guards through
`node scripts/test-run.mjs`, then restored with `git checkout`. The final diff touches no `src/main` file.
