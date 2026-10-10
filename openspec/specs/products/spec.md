# Products and Recipes Specification

## Purpose

Describes the finished-product catalog: creating, listing, updating and deleting products, SKU uniqueness, recipes,
opening stock, and the calculated selling price. Production runs are specified in `production`, product write-offs and
adjustments in `product-stock`. This is an already-implemented baseline reverse-engineered from the shipped code and its
tests; every requirement is an unratified assumption.

## Requirements

### Requirement: Create a product

`POST /api/products` (multipart) SHALL create a product from `sku` (required, at most 60), `name` (required, at most
120), `description` (at most 1000), `quantity` (whole number, at least 0, at most 12 digits), optional
`initialUnitCost`, `advertisingCostPerUnit` (default 0), `markupPercentage` (required) and a `recipe` part (FR-76).

> GAP: the length limits and fractional-quantity rejection are not asserted (see docs/requirements.md Coverage gaps, FR-76 row).

#### Scenario: Valid product
- **WHEN** a product is created with a SKU, name, markup, a recipe and quantity 2
- **THEN** it is stored with that quantity and a calculated selling price

#### Scenario: Fractional quantity
- **WHEN** a product is created with quantity 1.5
- **THEN** the request is rejected with 400 (code-level behavior, not test-verified)

### Requirement: SKU uniqueness

SKU SHALL be unique case-insensitively; a duplicate on create or update SHALL give 409 "A product with SKU “<sku>”
already exists."; an update ignores the product itself (FR-77).

#### Scenario: Duplicate SKU
- **GIVEN** a product with SKU "ROSE-1"
- **WHEN** another product is created with SKU "rose-1"
- **THEN** the response is 409 "A product with SKU “rose-1” already exists."

### Requirement: Markup and advertising cost precision

`markupPercentage` and `advertisingCostPerUnit` SHALL accept at most 2 decimals and SHALL NOT be negative; a value like
12.345 or 1.239 SHALL give 400 and no product is created; the markup allows at most 6 integer digits (UI maximum
999999.99) (FR-78).

#### Scenario: Three decimals
- **WHEN** a product is created with markup 12.345
- **THEN** the response is 400 and no product exists

### Requirement: Recipe rules

A product SHALL need a recipe of at least one item; each item SHALL have an existing raw material and a quantity per unit
greater than 0, and a raw material MAY appear only once; violations SHALL give 400 (or 404 for an unknown material)
(FR-79).

> GAP: backend validation of empty, duplicate, non-positive and unknown-material recipes is untested; only the client form is (see docs/requirements.md Coverage gaps, FR-79 row).

#### Scenario: Empty recipe
- **WHEN** a product is created with no recipe items
- **THEN** the request is rejected with 400

#### Scenario: Unknown raw material
- **WHEN** a recipe item references a raw material id that does not exist
- **THEN** the response is 404

### Requirement: Opening product stock

An opening product quantity above zero SHALL require an initial unit cost (400 "Initial unit cost is required when
initial stock is greater than zero"), rounded to 4 decimals half-up, which becomes the product's `averageUnitCost`, and
SHALL record an `OPENING_BALANCE` movement "Initial product stock" without consuming raw materials (FR-80).

> GAP: the server-side missing-cost rejection is tested only on the client (see docs/requirements.md Coverage gaps, FR-80 row).

#### Scenario: Opening stock does not consume materials
- **WHEN** a product is created with quantity 2 and initial unit cost 100
- **THEN** its `averageUnitCost` is 100, an `OPENING_BALANCE` movement exists and raw material quantities are unchanged

### Requirement: Calculated selling price

The selling price SHALL never be entered. On create and on every update it SHALL be computed as (sum of recipe quantity x
raw material averageUnitCost + advertisingCostPerUnit) x (1 + markupPercentage / 100), rounded to 2 decimals half-up (so
0.545 gives 0.55), and stored (FR-81).

> GAP: the stored price is not recalculated when a raw material's average cost later changes; whether that is intended is unclear (see docs/requirements.md OQ-1).

#### Scenario: Worked price
- **GIVEN** a recipe costing 100 per unit, advertising cost 0 and markup 125
- **WHEN** the product is saved
- **THEN** the selling price is 225.00

#### Scenario: Half-up rounding
- **GIVEN** a computed price of 0.545
- **WHEN** it is stored
- **THEN** it is 0.55

### Requirement: Product form previews

The product form SHALL preview the same selling price, recipe unit cost and stock values with exact decimal math (FR-82),
and creating a product from the UI SHALL post opening stock, initial unit cost and recipe (FR-87).

#### Scenario: Preview matches server
- **WHEN** recipe, advertising cost and markup are entered
- **THEN** the previewed price equals the server's calculated price

### Requirement: Update a product

`PUT /api/products/{id}` SHALL update SKU, name, description, advertising cost, markup, recipe (fully replaced) and
optionally the image; it SHALL NOT change quantity or average unit cost; an unknown id SHALL give 404 (FR-83).

> GAP: the 404 is not asserted (see docs/requirements.md Coverage gaps, FR-83 row).

#### Scenario: Edit without quantity
- **WHEN** a product is edited in the UI
- **THEN** the request does not resend quantity or initial unit cost

#### Scenario: Unknown product
- **WHEN** `PUT /api/products/9999` targets a missing id
- **THEN** the response is 404

### Requirement: Product list fields

The product list SHALL expose `quantity`, `averageUnitCost`, `stockValue` (quantity x average, 2 decimals),
`sellingPrice`, `markupPercentage`, `advertisingCostPerUnit` and the `recipe` (FR-84).

#### Scenario: Fields present
- **WHEN** the product list is read
- **THEN** each product carries these fields

### Requirement: Delete a product

A product that has any sale SHALL NOT be deleted (409 "Product “<name>” cannot be deleted because it has been sold.");
an unsold product SHALL be deleted with 204 and its recipe and movements removed with it (FR-85). The UI SHALL ask
"Delete product “<name>”?" via a browser confirm before deleting (FR-86).

> GAP: the cascade and the confirmation are not asserted (see docs/requirements.md OQ-5 / Coverage gaps, FR-85 and FR-86 rows).

#### Scenario: Sold product
- **GIVEN** a product with a sale
- **WHEN** it is deleted
- **THEN** the response is 409 "Product “<name>” cannot be deleted because it has been sold."

#### Scenario: Unsold product
- **WHEN** an unsold product is deleted
- **THEN** the response is 204
