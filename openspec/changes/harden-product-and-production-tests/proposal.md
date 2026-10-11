# Harden product and production tests

## Why
Ten rows of the baseline coverage gaps (`docs/requirements.md` › Coverage gaps) describe product, production and
product-stock behavior that ships but no backend test asserts: FR-76, FR-79, FR-80, FR-83, FR-85, FR-88, FR-93, FR-97,
FR-98 and FR-99. Slice H3 of `docs/mvp-capability-plan.md` pins them with tests. It is test-only: no production file
changes. Recalculating a stored selling price after a raw material's cost changes (OQ-1) stays out of scope.

## What Changes
- Ten tests in `InventoryFlowIntegrationTest` (MockMvc), each with an `@trace <id>` comment, plus small private helpers
  for raw materials, the multipart product form and JSON posts. Setup uses the API for products, production and
  adjustments and direct SQL for raw materials and for products that need a state the API cannot reach (a product
  with no recipe).
- No new class and no new dependency; the test file adds one import, `java.util.LinkedHashMap`, from a package it
  already uses.

## Impact
- Affected specs: `products`, `production`, `product-stock`. Their requirements and scenarios are unchanged; only the
  `> GAP:` notes become "Covered by slice" notes, and one scenario line (a fractional product quantity) loses its
  "not test-verified" remark.
- Affected code: `src/test/java` only. No `src/main` file in the final diff.
- Observed while testing: constraint failures on the multipart product form (length limits, quantity digits, recipe
  items) come back as a 400 titled "Validation error" (the `ApiExceptionHandler` handler), while JSON request bodies
  (H4) come back as "Bad Request". The tests pin what the server returns.
- Observed while testing: an unknown raw material in an updated recipe answers 404 from two places (the recipe check
  and the price calculation, which run in that order), so deleting the recipe check alone does not turn that
  assertion red. The cascade that deletes a product's recipe, batches and movements lives in `schema.sql`, so
  its test cannot be shown red without editing that guarded file; both are noted in the autonomy-log row.
