# Spec: Raw material reorder level and low-stock view

Status: Approved by volodya4u on 2026-10-05

## Goal

The shop needs to see which raw materials are running out. The admin sets a **reorder level** (minimum stock) on a
raw material; the system flags materials whose current quantity is at or below it and shows a count on the dashboard.

## Out of scope

- Automatic reordering, supplier notifications, or purchase orders.
- A reorder level for finished products (raw materials only this time).
- Any change to stock, valuation, production, sales, or movement logic. The reorder level is advisory only.

## Semantics

A raw material is **low stock** when `quantity <= reorder_level` AND `reorder_level > 0`. A `reorder_level` of `0`
means "not tracked", so existing materials do not all show as low. The field is NUMERIC like `quantity`, so a
threshold can be `0.5 kg` or `12.5 m`. It is a catalog field, editable in the normal raw-material form.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given an existing `raw_material` table without `reorder_level`, when the migration runs (twice), then the column exists with default 0 and the run is idempotent | `InventorySchemaMigrationTest` › `migratesAnExistingRawMaterialTableAndIsIdempotent` |
| 2 | Given a raw material created with quantity 3 and reorderLevel 5, when its DTO is read, then `reorderLevel = 5` and `belowReorderLevel = true`; with reorderLevel 0 → `false`; an edit updates the level | `InventoryFlowIntegrationTest` › `recordsRawMaterialReorderLevelAndLowStockFlag` |
| 3 | Given one material quantity 3 / reorder 5, one quantity 5 / reorder 5, and one reorder 0, when `GET /api/dashboard`, then `lowStockRawMaterials = 2` (boundary `≤` counts, reorder 0 excluded) | `InventoryFlowIntegrationTest` › `dashboardCountsLowStockRawMaterials` |
| 4 | Given a raw material with `belowReorderLevel = true`, when the list renders, then its row shows a "Low stock" badge | `frontend/src/app/raw-materials/raw-materials.component.spec.ts` › "marks a raw material below its reorder level" |
| 5 | Given a dashboard summary with `lowStockRawMaterials = 2`, when the dashboard renders, then a "Low Stock" card shows 2 | `frontend/src/app/dashboard/dashboard.component.spec.ts` › "shows the low-stock raw material count" |

## Changes

- **Schema**: `raw_material` gains `reorder_level NUMERIC NOT NULL DEFAULT 0 CHECK (reorder_level >= 0)` in
  `schema.sql`, plus an idempotent `ALTER TABLE … ADD COLUMN` in `InventorySchemaMigration` (mirroring the
  `average_unit_cost` block) with the column asserted in `InventorySchemaMigrationTest`.
- **API**:
  - `RawMaterialDto` += `BigDecimal reorderLevel`, `boolean belowReorderLevel`.
  - `RawMaterialRepository`: `reorder_level` and `quantity <= reorder_level AND reorder_level > 0 AS
    below_reorder_level` in `SUMMARY_COLUMNS`; `reorder_level` read with `SqliteDecimals.read`; `insert()`/`update()`
    carry it; new `long countLowStock()`.
  - `RawMaterialController` `create()`/`update()`: `@RequestParam(required = false) @DecimalMin("0.0") BigDecimal
    reorderLevel`.
  - `RawMaterialService` `create()`/`update()`: accept it, `null → BigDecimal.ZERO`.
  - `DashboardController.DashboardSummary` += `long lowStockRawMaterials` from `countLowStock()`.
- **UI**:
  - `core/models.ts`: `RawMaterial` += `reorderLevel`, `belowReorderLevel`; `DashboardSummary` += `lowStockRawMaterials`.
  - `raw-materials.component`: a `reorderLevel` form control (default 0, min 0), set on create/edit, sent on both; a
    "Low stock" badge on flagged rows.
  - `dashboard.component`: a "Low Stock" stat card.
  - No new route, so `app.routes.ts` and `SpaController` are unchanged.
- **Boundaries**: only `schema.sql` + migration (plan-mode approved). Nothing on the "Ask before" list.

## Changed after approval

- **AC5, 2026-10-05, after #57 merged.** The approved text promised a "Low stock" card. The card was built as
  "Low Stock", in title case like its sibling cards ("Raw Material Types", "Sales"); its test was aligned to the code,
  and neither the spec nor the reviewer caught the difference. `scripts/check-specs.mjs` found it (red in 205a5b7);
  the human chose to keep the code and update the spec. The status also lost its unfilled `Done in <PR link>`.
- **AC1 did not change.** Its first test checked that the column exists but not its default 0; the reviewer flagged
  that, and fc6c039 added the assertion. The criterion was right; the test caught up with it.

## Risks and open questions

- NUMERIC comparison in SQLite uses numeric affinity; AC3 pins the `≤` boundary and the reorder-0 exclusion.
- Existing databases: the migration defaults every row to 0, so nothing is flagged until the admin sets a level —
  behaviour is unchanged until then.

## Verification

- `node scripts/dod.mjs` green; each new test red before its change and green after; the `reviewer` subagent approves.
- Manual: set a raw material's reorder level above its quantity → a "Low stock" badge on the list and the dashboard
  count increments.
