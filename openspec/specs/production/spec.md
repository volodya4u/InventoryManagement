# Production Specification

## Purpose

Describes atomic production of finished products from raw materials according to the product recipe, including
shortage reporting, batch cost, and the product's weighted-average cost. This is an already-implemented baseline
reverse-engineered from the shipped code and its tests; every requirement is an unratified assumption.

## Requirements

### Requirement: Production input

`POST /api/products/{id}/production` SHALL take `quantity` (whole number greater than 0, at most 12 digits),
`productionDate` (required) and optional `notes` (at most 1000); a product with no recipe SHALL be rejected with 400
"Add at least one raw material to the product recipe" (FR-88).

> GAP: the no-recipe rejection is not asserted (see docs/requirements.md Coverage gaps, FR-88 row).

#### Scenario: Valid run
- **GIVEN** a product with a recipe and enough raw materials
- **WHEN** production of 1 unit is posted
- **THEN** the response is successful

#### Scenario: No recipe
- **GIVEN** a product without a recipe
- **WHEN** production is posted
- **THEN** the response is 400 "Add at least one raw material to the product recipe"

### Requirement: Shortage check before changing anything

Production SHALL multiply each recipe quantity by the produced quantity and check every raw material balance before
changing anything; if any is short it SHALL return 409 "Insufficient raw material stock" listing all shortages (for
example Ribbon missing 0.6) and no stock SHALL change (FR-89).

#### Scenario: Several shortages
- **GIVEN** two raw materials that are both short
- **WHEN** production is posted
- **THEN** the response is 409 "Insufficient raw material stock" listing both shortages and all quantities are unchanged

### Requirement: Atomic production

A successful production, in one transaction, SHALL deduct each raw material, record one `PRODUCTION_CONSUMPTION`
movement and one `production_consumption` row per material, add the product units, and record one `PRODUCTION` product
movement and one `production_batch` (FR-90); a rejected production changes nothing (transaction rule in `schema-migration`).

#### Scenario: Three materials
- **GIVEN** a recipe of three raw materials
- **WHEN** production succeeds
- **THEN** 3 consumption movements, 3 consumption rows, 1 batch and 1 `PRODUCTION` product movement are recorded

### Requirement: Batch cost

The batch total cost SHALL equal the sum of (required quantity x raw material averageUnitCost at that moment) plus
advertisingCostPerUnit x produced quantity; the batch unit cost SHALL be total / quantity rounded to 4 decimals half-up;
the advertising part SHALL be stored in `production_batch.advertising_cost` (FR-91).

#### Scenario: Batch with advertising
- **GIVEN** material cost of 138 and advertising of 12 for the run
- **WHEN** production succeeds
- **THEN** total cost is 150 and advertising cost is 12

### Requirement: Product weighted-average cost after production

After production the product's `averageUnitCost` SHALL equal (oldQuantity x oldAverage + batch total cost) / newQuantity,
rounded to 4 decimals half-up (FR-92).

#### Scenario: Worked example
- **GIVEN** 2 units at average 100
- **WHEN** a batch of 1 unit costing 150 total is produced
- **THEN** `averageUnitCost` is 116.6667

### Requirement: Production is the only source of produced units

Production SHALL be the only operation that adds produced units; changing a recipe later SHALL affect only future
production and past batches SHALL keep their recorded quantities and costs (FR-93).

> GAP: no test edits a recipe after a batch (see docs/requirements.md Coverage gaps, FR-93 row).

#### Scenario: Recipe edited after a batch
- **GIVEN** a product with a recorded batch
- **WHEN** its recipe is edited
- **THEN** the recorded batch quantities and costs are unchanged

### Requirement: Production dialog

The production dialog SHALL count material needs and the production cost with exact decimals, post the production when
materials suffice, and reload (FR-94).

#### Scenario: Enough materials
- **WHEN** the user confirms a run the materials cover
- **THEN** the production is posted and the page reloads
