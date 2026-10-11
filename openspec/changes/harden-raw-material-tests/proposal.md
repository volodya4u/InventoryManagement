# Harden raw material tests

## Why
Ten rows of the baseline coverage gaps (`docs/requirements.md` › Coverage gaps) describe raw material, receipt,
adjustment and reorder-level behavior that ships but no backend test asserts: FR-42, FR-43, FR-46, FR-48, FR-49,
FR-54, FR-56, FR-60, FR-61 and FR-67. Slice H2 of `docs/mvp-capability-plan.md` pins them with tests. It is test-only:
no production file changes.

## What Changes
- Ten tests in `InventoryFlowIntegrationTest` (MockMvc), each with an `@trace <id>` comment, plus three small private
  helpers (`postRawMaterial`, `putRawMaterial`, `rowCount`). They reuse `signedInSession()`, `csrfCookie()`,
  `postJson()`, `saveProduct()` and `assertMaterialQuantity()`.
- No new class, no new dependency and no new import.
- FR-54 (history is deleted with the material) and FR-56 (duplicate names are accepted) pin today's behavior; OQ-3 and
  OQ-5 stay ratified as-is.

## Impact
- Affected specs: `raw-materials`, `raw-material-stock`, `reorder-level`. Their requirements and scenarios are
  unchanged; only the `> GAP:` notes become "Covered by slice" notes.
- Affected code: `src/test/java` only. No `src/main` file in the final diff.
- Showing the tests fail needed one temporary one-line change to `src/main/resources/schema.sql` (the movement table's
  `ON DELETE CASCADE` as `RESTRICT`), restored with `git checkout` straight after; the rest are one-line breaks in
  the raw material controller, service and repository, `MeasurementUnit` and `ProductService`.
- FR-60 is asserted for stock, valuation, movement history, production and write-offs. Sales deal in product stock
  only and never read a raw material, so no sales assertion applies.
