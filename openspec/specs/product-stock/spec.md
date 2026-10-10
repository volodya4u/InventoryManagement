# Product Stock Operations Specification

## Purpose

Describes write-offs and stock adjustments of finished products, which accept whole units only, and the Products page
behavior for them. This is an already-implemented baseline reverse-engineered from the shipped code and its tests; every
requirement is an unratified assumption.

## Requirements

### Requirement: Product write-off

`POST /api/products/{id}/write-offs` SHALL take a whole `quantity` greater than 0, `operationDate`, `reason` (required,
at most 200) and optional `notes`; it SHALL reduce the quantity, keep the average cost and record a `WRITE_OFF` movement
at that average (FR-95).

#### Scenario: Write-off value
- **GIVEN** 5 units at average 150
- **WHEN** 2 units are written off
- **THEN** 3 units remain, stock value is 450.00 and a `WRITE_OFF` movement exists at cost 150

### Requirement: Insufficient product stock on write-off

A product write-off larger than the balance SHALL give 409 "Insufficient product stock" and change nothing (FR-96).

#### Scenario: Too many units
- **GIVEN** 3 units in stock
- **WHEN** a write-off of 4 is posted
- **THEN** the response is 409 "Insufficient product stock" and the quantity stays 3

### Requirement: Whole-unit quantities

Product write-off and adjustment quantities SHALL be whole numbers; a fractional value SHALL give 400 "<field> must be a
whole number" (FR-97).

> GAP: the fractional adjustment is not asserted; the fractional write-off is (see docs/requirements.md OQ-12 / Coverage gaps, FR-97 row).

#### Scenario: Fractional write-off
- **WHEN** a write-off of 1.5 is posted
- **THEN** the response is 400 "quantity must be a whole number" naming the field

### Requirement: Product adjustment

`POST /api/products/{id}/adjustments` SHALL set the quantity to the counted `actualQuantity` (whole, at least 0) and
record `ADJUSTMENT_INCREASE` or `ADJUSTMENT_DECREASE` at the current average cost; an increase SHALL NOT consume raw
materials (FR-98).

> GAP: the "no raw materials consumed" part is not asserted (see docs/requirements.md Coverage gaps, FR-98 row).

#### Scenario: Increase then decrease
- **GIVEN** 3 units in stock
- **WHEN** the actual quantity is set to 6, then to 1
- **THEN** an `ADJUSTMENT_INCREASE` of 3 and an `ADJUSTMENT_DECREASE` of 5 are recorded at the current average cost

### Requirement: No-op product adjustment is rejected

A product adjustment equal to the current quantity SHALL be rejected with 400 "Actual stock already matches the recorded
Product stock" (FR-99).

> GAP: not asserted by any test (see docs/requirements.md Coverage gaps, FR-99 row).

#### Scenario: Same quantity
- **GIVEN** 6 units in stock
- **WHEN** the actual quantity is set to 6
- **THEN** the response is 400 "Actual stock already matches the recorded Product stock"

### Requirement: Products page write-off and adjustment dialogs

The Products page SHALL block a write-off larger than the stock and SHALL send an adjustment as the counted quantity,
updating the row in place (FR-100).

#### Scenario: Oversized write-off blocked
- **WHEN** the user enters a write-off larger than the stock
- **THEN** nothing is posted

#### Scenario: Adjustment sent as counted quantity
- **WHEN** the user submits an adjustment of 6
- **THEN** the request carries `actualQuantity` 6 and the row updates in place
