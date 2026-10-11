# Harden sales, reports and history tests

## Why
Seventeen rows of the baseline coverage gaps (`docs/requirements.md` › Coverage gaps) describe sales, returns,
dashboard, stock history and monthly report behavior that ships but no backend test asserts: FR-37, FR-38, FR-102,
FR-103, FR-107, FR-109, FR-110, FR-114, FR-116, FR-117, FR-118, FR-127, FR-131, FR-132, FR-134, FR-141 and FR-143.
Slice H4 of `docs/mvp-capability-plan.md` pins them with tests. It touches the money and stock arithmetic paths, which
have the most behavior pinned by the fewest tests. It is test-only: no production file changes.

## What Changes
- Seventeen tests in `InventoryFlowIntegrationTest` (MockMvc), each with an `@trace <id>` comment, plus small private
  helpers for products, sales, returns and JSON posts. Setup uses the API for sales, returns and cancellations and
  direct SQL for stock movements and production batches.
- No new class and no new dependency. The test file adds two imports, `MockMvcRequestBuilders.request` and
  `java.util.ArrayList`, from classes and packages it and the main code already use.

## Impact
- Affected specs: `dashboard`, `sales`, `returns-cancellations`, `stock-history`, `monthly-sales-report`. Their
  requirements and scenarios are unchanged; only the `> GAP:` notes become "Covered by slice" notes. The OQ-2
  question (should returned sales count on the dashboard) stays open.
- Affected code: `src/test/java` only. No `src/main` file in the final diff.
- Observed while testing: Bean Validation failures on a request body come back as a 400 titled "Bad Request" (Spring's
  own problem detail), so the `validation` handler in `ApiExceptionHandler` is not what answers those. The tests pin
  what the server returns.
- Corrected while testing: the FR-132 text said the whole ordering chain is descending, but the code sorts inventory
  type ascending (PRODUCT before RAW_MATERIAL); the requirement and the `stock-history` spec now say so.
