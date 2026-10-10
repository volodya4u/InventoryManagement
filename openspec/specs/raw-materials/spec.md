# Raw Materials Specification

## Purpose

Describes the raw material catalog: creating, listing, updating and deleting raw materials, measurement units,
opening stock and its weighted-average cost, stock valuation, and the delete guards. Receipts, write-offs and
adjustments are specified in `raw-material-stock`, images in `images`, and the reorder level in `reorder-level`. This is
an already-implemented baseline reverse-engineered from the shipped code and its tests; every requirement is an
unratified assumption.

## Requirements

### Requirement: Create a raw material

`POST /api/raw-materials` (multipart) SHALL create a raw material from `name` (required, at most 120 characters,
trimmed), `description` (at most 1000 characters, default empty, trimmed), `unit`, `quantity` (at least 0) and optional
`initialUnitCost`, `reorderLevel` and `image` (FR-42).

> GAP: the length limits and the negative-quantity rejection are not asserted; trimming is (see docs/requirements.md Coverage gaps, FR-42 row).

#### Scenario: Name is trimmed
- **WHEN** a raw material is created with name "  Rose  "
- **THEN** it is stored as "Rose"

#### Scenario: Negative quantity
- **WHEN** a raw material is created with quantity -1
- **THEN** the request is rejected with 400 (code-level behavior, not test-verified)

### Requirement: Measurement units

The unit SHALL be one of PIECE, BUNCH, GRAM, KILOGRAM, METER, PACKAGE, matched case-insensitively; any other value
SHALL give 400 "Unsupported measurement unit" (FR-43). The unit list is fixed in code, and raw material quantities may
be decimal (TC-8).

> GAP: only acceptance of "piece" is asserted; the rejection is not (see docs/requirements.md Coverage gaps, FR-43 row).

#### Scenario: Case-insensitive unit
- **WHEN** a raw material is created with unit "piece"
- **THEN** it is accepted as PIECE

#### Scenario: Unknown unit
- **WHEN** a raw material is created with unit "BOX"
- **THEN** the response is 400 "Unsupported measurement unit"

### Requirement: Opening stock cost

Initial unit cost SHALL be required when the initial quantity is greater than zero (400 "Initial unit cost is required
when initial stock is greater than zero") and optional, treated as 0, when the quantity is zero (FR-44). It SHALL be
rounded to 4 decimals half-up and become the raw material's `averageUnitCost` (FR-45).

#### Scenario: Missing cost with positive stock
- **WHEN** a raw material is created with quantity 10 and no initial unit cost
- **THEN** the response is 400 "Initial unit cost is required when initial stock is greater than zero"

#### Scenario: Rounding of the initial cost
- **WHEN** a raw material is created with initial unit cost 1.23456
- **THEN** its `averageUnitCost` is 1.2346

### Requirement: Opening balance movement

Creating a raw material with initial quantity above zero SHALL record an `OPENING_BALANCE` movement with quantity, unit
cost, total, note "Initial stock", dated today by the server clock; a zero quantity SHALL record none (FR-46).

> GAP: the zero-quantity case is not asserted (see docs/requirements.md Coverage gaps, FR-46 row).

#### Scenario: Positive opening stock
- **WHEN** a raw material is created with quantity 10 and unit cost 5
- **THEN** one `OPENING_BALANCE` movement exists with quantity 10, unit cost 5, total 50 and note "Initial stock"

#### Scenario: Zero opening stock
- **WHEN** a raw material is created with quantity 0
- **THEN** no movement is recorded

### Requirement: Stock value

`stockValue` SHALL equal quantity multiplied by `averageUnitCost`, rounded to 2 decimals half-up (FR-47).

#### Scenario: Value of a stocked material
- **GIVEN** quantity 10 at average cost 15
- **WHEN** the list is read
- **THEN** `stockValue` is 150.00

### Requirement: List ordering

`GET /api/raw-materials` SHALL list all raw materials ordered by name, case-insensitive (FR-48).

> GAP: ordering is not asserted (see docs/requirements.md Coverage gaps, FR-48 row).

#### Scenario: Mixed-case names
- **GIVEN** materials named "ribbon", "Rose" and "Baby's breath"
- **WHEN** the list is read
- **THEN** the order is "Baby's breath", "ribbon", "Rose"

### Requirement: Update a raw material

`PUT /api/raw-materials/{id}` SHALL update name, description, unit, reorder level and optionally the image; it has no
quantity or cost input, so the regular edit cannot change stock; an unknown id SHALL give 404 (FR-49).

> GAP: the 404 is not asserted (see docs/requirements.md Coverage gaps, FR-49 row).

#### Scenario: Rename
- **WHEN** a raw material is renamed through `PUT`
- **THEN** the new name is returned and quantity and average cost are unchanged

#### Scenario: Unknown id
- **WHEN** `PUT /api/raw-materials/9999` targets a missing id
- **THEN** the response is 404

### Requirement: Unit change guard

The unit SHALL be changeable only while `unitChangeable` is true (quantity is 0, no stock movement exists and no recipe
uses it); otherwise the response SHALL be 409 "The unit of “<name>” cannot be changed because stock, stock history, or
recipes already use it. Create a new raw material for the new unit instead." (FR-50).

#### Scenario: Unit change refused
- **GIVEN** a raw material with recorded quantities
- **WHEN** its unit is changed through `PUT`
- **THEN** the response is 409 with the message above

### Requirement: List fields

The raw material list SHALL expose `unitChangeable`, `hasImage`, `stockValue`, `reorderLevel` and `belowReorderLevel`
(FR-51).

#### Scenario: Fields present
- **WHEN** the list is read
- **THEN** each row has these five fields

### Requirement: Delete guards

Deleting a raw material that appears in a product recipe SHALL be rejected with 409 "Raw material “<name>” is used in
the recipe of <product names>. Remove it from the recipe before deleting it." (FR-52). Deleting a raw material consumed
by any production batch SHALL be rejected with 409 "Raw material “<name>” cannot be deleted because production batches
have consumed it." (FR-53).

#### Scenario: Used in a recipe
- **GIVEN** a raw material in a product recipe
- **WHEN** it is deleted
- **THEN** the response is 409 naming the products

#### Scenario: Consumed by a batch
- **GIVEN** a raw material consumed by a production batch
- **WHEN** it is deleted
- **THEN** the response is 409 "Raw material “<name>” cannot be deleted because production batches have consumed it."

### Requirement: Delete an unused raw material

Deleting an unused raw material SHALL return 204, and its stock movements SHALL be removed with it (`ON DELETE
CASCADE`) (FR-54).

> GAP: the movement cascade is not asserted (see docs/requirements.md OQ-5 / Coverage gaps, FR-54 row).

#### Scenario: Unused material
- **WHEN** an unused raw material is deleted
- **THEN** the response is 204 and its movements no longer exist

### Requirement: Delete confirmation in the UI

The UI SHALL ask "Delete raw material “<name>”?" through a browser confirm before deleting (FR-55).

> Covered by slice `harden-frontend-specs`: `raw-materials.component.spec.ts` asserts the delete confirmation.

#### Scenario: User cancels
- **WHEN** the user declines the confirm
- **THEN** no delete request is sent

### Requirement: Names are not unique

Raw material names SHALL NOT be required to be unique (FR-56).

> GAP: duplicate acceptance is not asserted; whether this is intended is unclear (see docs/requirements.md OQ-3 / Coverage gaps, FR-56 row).

#### Scenario: Duplicate name
- **GIVEN** a raw material named "Rose"
- **WHEN** another named "Rose" is created
- **THEN** it is accepted
