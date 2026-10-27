# Close the remaining local nonfunctional evidence gaps

Kind: hardening

## Why

NFR-19, NFR-21 and NFR-22 describe shipped behavior, but their evidence is partial. The localization baseline also says every displayed date is ISO, while the shipped lists and report deliberately show readable English dates. The owner chose to keep that display and correct the baseline. A new assertion also found that date-only API values can render one day early when the date pipe converts local midnight to UTC; the owner approved correcting that date shift.

## What Changes

- Pin validation before requests and server-error display for the raw material, product and sales write forms that lack direct assertions.
- Assert the document language and the existing English date formats, while date inputs and API values remain ISO. Correct the date shift on Sales, Monthly Sales and Stock History displays.
- Assert that a real monthly-sales API response contains numeric amounts and no currency-code field.
- Update the NFR rows and app-shell baseline spec to state the behavior these tests prove. No dependency, waiver, or gate changes are planned.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given an invalid raw-material save, receipt or stock operation, when submitted, then no write request is sent; when a valid write is rejected by the API, then the form shows its message | `frontend/src/app/raw-materials/raw-materials.component.spec.ts` › "guards raw material write forms and shows API errors" |
| 2 | Given an invalid product save, production or stock operation, when submitted, then no write request is sent; when a valid write is rejected by the API, then the form shows its message | `frontend/src/app/products/products.component.spec.ts` › "guards product write forms and shows API errors" |
| 3 | Given an invalid sale, return or cancellation, when submitted, then no write request is sent; when a valid write is rejected by the API, then the form shows its message | `frontend/src/app/sales/sales.component.spec.ts` › "guards sales write forms and shows API errors" |
| 4 | Given the application entry document, when it is loaded, then its language is English | `InventoryFlowIntegrationTest` › `declaresEnglishAsTheDocumentLanguage` |
| 5 | Given an ISO sale date from the API, when the Sales page renders it, then the list shows the same calendar day in readable English and the date input retains the ISO value | `frontend/src/app/sales/sales.component.spec.ts` › "shows readable English sale dates and keeps ISO form values" |
| 6 | Given a monthly-sales response containing amounts, when the API returns it, then amounts are numeric and neither the response nor the sale storage schema carries a currency-code field | `InventoryFlowIntegrationTest` › `reportsAmountsWithoutCurrencyCodes` |
| 7 | Given ISO period and transaction dates, when the Monthly Sales page renders them, then the readable English dates retain the API calendar day | `frontend/src/app/reports/monthly-sales/monthly-sales-report.component.spec.ts` › "shows report dates on their API calendar day" |
| 8 | Given an ISO movement date, when Stock History renders it, then the readable English date retains the API calendar day | `frontend/src/app/stock-movements/stock-movements.component.spec.ts` › "shows movement dates on their API calendar day" |

## Impact

- Requirements: NFR-19, NFR-21, NFR-22 in `docs/requirements.md`.
- Baseline spec: `openspec/specs/app-shell-routing/spec.md` (edited directly and kept in sync with the requirements).
- Application markup: Sales, Monthly Sales and Stock History date pipes. Tests: existing Angular specs and `InventoryFlowIntegrationTest`.
- The five baseline waivers remain open for separate owner decisions and tooling slices.
