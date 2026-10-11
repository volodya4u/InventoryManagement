# Dashboard Specification

## Purpose

Describes the inventory summary returned by `GET /api/dashboard` and shown on the Dashboard page, including the
low-stock raw material count. This is an already-implemented baseline reverse-engineered from the shipped code and its
tests; every requirement is an unratified assumption.

## Requirements

### Requirement: Inventory summary counts

`GET /api/dashboard` SHALL return `rawMaterialTypes` (count of raw materials), `productTypes` (count of products) and
`productUnits` (sum of product quantities) (FR-37).

> Covered by slice `harden-sales-reports-history-tests`: `InventoryFlowIntegrationTest` › `countsRawMaterialsProductsAndProductUnitsOnTheDashboard` asserts the three values.

#### Scenario: Counts of catalog and units
- **GIVEN** 2 raw materials and 1 product with quantity 5
- **WHEN** a signed-in client calls `/api/dashboard`
- **THEN** `rawMaterialTypes` is 2, `productTypes` is 1 and `productUnits` is 5

### Requirement: Sales count covers completed sales only

`salesCount` SHALL count only sales whose status is `COMPLETED`, so `CANCELLED`, `RETURNED` and `PARTIALLY_RETURNED`
sales are not counted (FR-38).

> Stated by the owner on 2026-10-11 (docs/requirements.md OQ-2): the dashboard counts completed sales only. Before that answer the count excluded only `CANCELLED` sales.
> Covered by `InventoryFlowIntegrationTest` › `countsOnlyCompletedSalesOnTheDashboard`, which asserts all three exclusions.

#### Scenario: One completed sale
- **GIVEN** one `COMPLETED` sale
- **WHEN** the dashboard is requested
- **THEN** `salesCount` is 1

#### Scenario: Cancelled sale
- **GIVEN** a sale in status `CANCELLED`
- **WHEN** the dashboard is requested
- **THEN** that sale is not counted

#### Scenario: Returned and partly returned sales
- **GIVEN** one `COMPLETED` sale, one `PARTIALLY_RETURNED` sale and one `RETURNED` sale
- **WHEN** the dashboard is requested
- **THEN** `salesCount` is 1

### Requirement: Low-stock count

`lowStockRawMaterials` SHALL count raw materials with `reorder_level > 0 AND quantity <= reorder_level`; the boundary
counts and reorder level 0 is excluded (FR-39).

#### Scenario: Boundary and untracked
- **GIVEN** one material with reorder level 10 and quantity 10, and one with reorder level 0 and quantity 0
- **WHEN** the dashboard is requested
- **THEN** `lowStockRawMaterials` is 1

### Requirement: Dashboard page content

The Dashboard page SHALL show the inventory summary and a "Low Stock" card with the low-stock count (FR-40).

#### Scenario: Summary shown
- **WHEN** the summary call succeeds
- **THEN** the page shows the summary values and a "Low Stock" card with the low-stock count

### Requirement: Dashboard error and reload

When the summary call fails, the page SHALL show the API error instead of numbers, and it SHALL be reloadable, clearing
the previous error (FR-41).

#### Scenario: Failure then reload
- **GIVEN** the summary call failed and the page shows the API error
- **WHEN** the user reloads and the call succeeds
- **THEN** the error is cleared and the numbers are shown
