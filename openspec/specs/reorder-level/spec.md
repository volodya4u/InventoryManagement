# Reorder Level Specification

## Purpose

Describes the advisory reorder level on raw materials and the resulting low-stock flag and badge. It is derived from the
approved spec `docs/specs/raw-material-reorder-level.md`, which matches the code. This is an already-implemented
baseline; the code and its tests are the proof.

## Requirements

### Requirement: Reorder level field

A raw material SHALL have an optional `reorderLevel` (numeric, at least 0, default 0 when omitted), editable on create
and update; 0 means "not tracked" (FR-57).

#### Scenario: Omitted level
- **WHEN** a raw material is created without `reorderLevel`
- **THEN** its `reorderLevel` is 0

#### Scenario: Level set on update
- **WHEN** a raw material is updated with `reorderLevel` 10
- **THEN** the list returns `reorderLevel` 10

### Requirement: Below-reorder-level flag

`belowReorderLevel` SHALL be true exactly when `reorderLevel > 0` and `quantity <= reorderLevel` (FR-58).

#### Scenario: Boundary
- **GIVEN** reorder level 10 and quantity 10
- **WHEN** the list is read
- **THEN** `belowReorderLevel` is true

#### Scenario: Above level
- **GIVEN** reorder level 10 and quantity 11
- **WHEN** the list is read
- **THEN** `belowReorderLevel` is false

#### Scenario: Untracked
- **GIVEN** reorder level 0 and quantity 0
- **WHEN** the list is read
- **THEN** `belowReorderLevel` is false

### Requirement: Low stock badge

The raw material list SHALL show a "Low stock" badge on rows with `belowReorderLevel = true` (FR-59).

#### Scenario: Badge shown
- **GIVEN** a row with `belowReorderLevel = true`
- **WHEN** the list renders
- **THEN** that row shows a "Low stock" badge

### Requirement: Advisory only

The reorder level SHALL be advisory only and SHALL NOT change stock, valuation, production, sales or movement logic
(FR-60). Automatic reordering, supplier notifications, purchase orders and a reorder level for finished products are
out of scope (TC-6).

> Covered by slice `harden-raw-material-tests`: `InventoryFlowIntegrationTest` › `leavesStockValuationHistoryAndProductionAloneWhenTheReorderLevelChanges` asserts that a new level changes no stock, cost, value or history and blocks neither production nor a write-off.

#### Scenario: Selling or consuming ignores the level
- **GIVEN** a raw material at or below its reorder level
- **WHEN** it is received, written off or consumed by production
- **THEN** the operation follows its normal rules and nothing is blocked or created because of the level
