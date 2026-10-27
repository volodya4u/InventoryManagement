# Design — harden-raw-material-tests

> Reconstructed on 2026-10-27. The slice was archived without a `design.md`. This file is written from its
> `proposal.md`, `tasks.md` and the merged commit 17b199c (pull request #74, branch `claude/harden-raw-material-tests`);
> it records what that diff shows and nothing the original author did not save. See `docs/qa/historical-gaps.md`.

## Approach
Test-only. Ten MockMvc tests in `InventoryFlowIntegrationTest`, each tagged `@trace <id>`, with three small private
helpers (`postRawMaterial`, `putRawMaterial`, `rowCount`). They reuse the existing `signedInSession()`, `csrfCookie()`,
`postJson()`, `saveProduct()` and `assertMaterialQuantity()`. No new class, dependency or import.

## Behavior pinned as it is
FR-54 (history is deleted with the material) and FR-56 (duplicate names are accepted) describe today's behavior. OQ-3 and
OQ-5 stay ratified as they are, so the tests hold them and do not argue with them.

## Scope of FR-60
Asserted for stock, valuation, movement history, production and write-offs. Sales deal in product stock only and never
read a raw material, so no sales assertion applies.

## Red evidence
Each assertion was shown failing against a one-line break of the production file it guards, restored with
`git checkout`. The movement-cascade test needed a temporary change to `src/main/resources/schema.sql` (the movement
table's `ON DELETE CASCADE` as `RESTRICT`), also restored at once. The final diff touches no `src/main` file.
