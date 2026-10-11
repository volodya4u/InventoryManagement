# Raw Material Stock Operations Specification

## Purpose

Describes receipts with weighted-average costing, write-offs and stock adjustments of raw materials, exact decimal
quantities, and the matching client-side calculations. This is an already-implemented baseline reverse-engineered from
the shipped code and its tests; every requirement is an unratified assumption.

## Requirements

### Requirement: Receipt input

`POST /api/raw-materials/{id}/receipts` SHALL take `receivedQuantity` (greater than 0), `unitPurchaseCost` (at least 0),
`receiptDate` (required) and optional `notes` (at most 1000) (FR-61).

> Covered by slice `harden-raw-material-tests`: `InventoryFlowIntegrationTest` › `rejectsInvalidReceiptsAndRecordsNothing` asserts every receipt validation rejection and the accepted limits.

#### Scenario: Valid receipt
- **WHEN** a receipt of 20 units at 15.5 dated today is posted
- **THEN** the response is successful and the quantity rises by 20

#### Scenario: Zero quantity
- **WHEN** a receipt with `receivedQuantity` 0 is posted
- **THEN** the response is 400 (code-level behavior, not test-verified)

### Requirement: Weighted-average cost on receipt

A receipt SHALL set the new `averageUnitCost` to (currentQuantity x currentAverage + receivedQuantity x unitCost) /
newQuantity, rounded to 4 decimals half-up, and raise the quantity (FR-62).

#### Scenario: Worked example
- **GIVEN** 10 units at average 20
- **WHEN** 5 units at 26 are received
- **THEN** the quantity is 15 and `averageUnitCost` is 22

### Requirement: Receipt movement

A receipt SHALL record a `RECEIPT` movement with the received quantity, unit cost rounded to 4 decimals, total =
quantity x unit cost, the receipt date and trimmed notes (FR-63).

#### Scenario: Movement recorded
- **WHEN** 5 units at 26 are received with notes " delivery "
- **THEN** a `RECEIPT` movement exists with quantity 5, unit cost 26, total 130 and notes "delivery"

### Requirement: Raw material write-off

`POST /api/raw-materials/{id}/write-offs` SHALL take `quantity` (greater than 0), `operationDate`, `reason` (required,
at most 200) and optional `notes` (at most 1000); it SHALL reduce the quantity, keep the average unit cost and record a
`WRITE_OFF` movement valued at that average cost with notes "Reason: <reason>. <notes>" (or "Reason: <reason>" when notes
are empty) (FR-64).

#### Scenario: Write-off value and note
- **GIVEN** 10 units at average 20
- **WHEN** 2.5 units are written off with reason "Wilted" and no notes
- **THEN** 7.5 units remain, stock value is 150.00, the movement total is 50 and the note is "Reason: Wilted"

### Requirement: Insufficient raw material stock

A write-off larger than the balance SHALL be rejected with 409 "Insufficient raw material stock" plus a `shortages`
list (required, available, missing quantity), and SHALL change nothing (FR-65).

#### Scenario: Write-off exceeds balance
- **GIVEN** 7.5 units in stock
- **WHEN** a write-off of 10 is posted
- **THEN** the response is 409 "Insufficient raw material stock" with a shortage of 2.5 and the quantity stays 7.5

### Requirement: Raw material adjustment

`POST /api/raw-materials/{id}/adjustments` SHALL set the quantity to `actualQuantity` (at least 0) and record the
difference as `ADJUSTMENT_INCREASE` or `ADJUSTMENT_DECREASE` at the current average unit cost, leaving the average
unchanged (FR-66).

#### Scenario: Increase then decrease
- **GIVEN** 7.5 units in stock
- **WHEN** the actual quantity is set to 9, then to 4
- **THEN** an `ADJUSTMENT_INCREASE` of 1.5 and then an `ADJUSTMENT_DECREASE` of 5 are recorded and the average cost is unchanged

### Requirement: No-op adjustment is rejected

An adjustment whose actual quantity equals the recorded quantity SHALL be rejected with 400 "Actual stock already
matches the recorded raw material stock" (FR-67).

> Covered by slice `harden-raw-material-tests`: `InventoryFlowIntegrationTest` › `rejectsAnAdjustmentEqualToTheRecordedRawMaterialQuantity` asserts the 400 and that nothing is recorded.

#### Scenario: Same quantity
- **GIVEN** 9 units in stock
- **WHEN** the actual quantity is set to 9
- **THEN** the response is 400 "Actual stock already matches the recorded raw material stock"

### Requirement: Exact decimal quantities

Raw material quantities MAY be fractional (for example 0.8 m, 2.5 kg); stock SHALL be read and subtracted with exact
decimals so floating-point drift such as 1 - 0.8 never reaches the API (FR-68). Values read from SQLite are normalized to 15 significant digits (rounding rules are in
`schema-migration`).

#### Scenario: Drifted stored value
- **GIVEN** a raw material holding 1 m and a consumption of 0.8 m
- **WHEN** the remainder is computed
- **THEN** the API shows the exact decimal 0.2, not 0.19999999999999996

### Requirement: Client-side exact decimal calculations

The Raw Materials page SHALL compute initial stock value, receipt total, write-off and adjustment values and the total
stock value of all materials with exact decimal arithmetic (`core/decimal.ts`), including adjustments finer than four
decimal places (FR-69).

#### Scenario: Receipt total
- **WHEN** the receipt form has quantity and unit cost entered
- **THEN** the displayed total equals the server's total with no floating-point drift
