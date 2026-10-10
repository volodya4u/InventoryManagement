# Sales Specification

## Purpose

Describes creating and reading sales: validation, atomic stock deduction, immutable financial snapshots, rounding,
sale numbering, net values and the Sales page. Returns and cancellations are specified in `returns-cancellations`. This
is an already-implemented baseline reverse-engineered from the shipped code and its tests; every requirement is an
unratified assumption. Completed sales are retained permanently and reversed only by separate audited documents; catalog
edits or deletions never rewrite completed sale values (BC-6).

## Requirements

### Requirement: Sale input

`POST /api/sales` SHALL require `saleDate`, `paymentMethod` (`CASH`, `CARD` or `BANK_TRANSFER`), optional `notes` (at
most 1000) and 1 to 100 items; otherwise it SHALL give 400 (FR-101).

#### Scenario: Incomplete sale
- **WHEN** a sale is posted without items
- **THEN** the response is 400 and no repository is accessed

#### Scenario: Valid sale
- **WHEN** a sale with date, payment method CASH and one item is posted
- **THEN** it is created

### Requirement: Sale item rules

Each sale item SHALL need an existing product (404 otherwise), a whole `quantity` greater than 0 (at most 12 digits) and
a `unitPrice` of at least 0 with at most 2 decimals; a product MAY appear only once per sale (FR-102).

> GAP: duplicate-product, fractional, negative-price and unknown-product rejections are not asserted (see docs/requirements.md Coverage gaps, FR-102 row).

#### Scenario: Unknown product
- **WHEN** an item references a missing product id
- **THEN** the response is 404

#### Scenario: Duplicate product
- **WHEN** the same product appears twice in one sale
- **THEN** the request is rejected with 400 (code-level behavior, not test-verified)

### Requirement: Sale numbering

Each sale SHALL get a unique number `SALE-YYYYMMDD-NNNN`, where the date is the sale date and NNNN is the highest
existing number for that date plus one, zero-padded to 4 digits (FR-103).

> GAP: incrementing within a date is not asserted (see docs/requirements.md Coverage gaps, FR-103 row).

#### Scenario: First sale of a date
- **WHEN** the first sale dated 2026-07-21 is created
- **THEN** its number is `SALE-20260721-0001`

#### Scenario: Second sale of the same date
- **GIVEN** `SALE-20260721-0001` exists
- **WHEN** another sale dated 2026-07-21 is created
- **THEN** its number is `SALE-20260721-0002`

### Requirement: Insufficient product stock rejects the whole sale

If any item needs more units than the product holds, the whole sale SHALL be rejected with 409 "Insufficient product
stock" and a `shortages` list (SKU and missing quantity per product); no sale, item or stock change SHALL be saved
(FR-104).

#### Scenario: One item short
- **GIVEN** a product with 2 units
- **WHEN** a sale of 3 units is posted
- **THEN** the response is 409 "Insufficient product stock" with a shortage of 1 for that SKU
- **AND** no sale exists and the stock is still 2

### Requirement: Atomic stock deduction and movements

A successful sale, in one transaction, SHALL deduct each product's stock and record one `SALE` product movement per item
valued at the product's average unit cost, with note "Sale <number>" (FR-105).

#### Scenario: Movement per item
- **WHEN** a sale with one item succeeds
- **THEN** stock is reduced by the item quantity and one `SALE` movement with note "Sale <number>" exists at the average unit cost

### Requirement: Immutable item snapshots

Each sale item SHALL store immutable snapshots: product SKU, product name, recommended unit price (the product's selling
price at sale time), actual unit price and unit cost (the product's average unit cost at sale time) (FR-106).

#### Scenario: Snapshot values
- **GIVEN** a product with selling price 250 and average cost 150
- **WHEN** it is sold at 240
- **THEN** the item stores recommended price 250, actual price 240 and unit cost 150

### Requirement: Sale totals and rounding

Line revenue SHALL equal round2(quantity x unit price), line cost round2(quantity x unit cost); sale totals SHALL sum the
lines; gross profit SHALL equal revenue - cost and may be negative; rounding is half-up to 2 decimals (FR-107).

> GAP: a negative profit is not asserted (see docs/requirements.md Coverage gaps, FR-107 row).

#### Scenario: Two units
- **GIVEN** unit price 240 and unit cost 150
- **WHEN** 2 units are sold
- **THEN** revenue is 480, cost is 300 and gross profit is 180

### Requirement: Initial status

A new sale SHALL have status `COMPLETED` (FR-108).

#### Scenario: New sale
- **WHEN** a sale is created
- **THEN** its status is `COMPLETED`

### Requirement: Reading sales

`GET /api/sales` SHALL list sales newest first (sale date, then id, descending), each with items and reversal documents;
`GET /api/sales/{id}` SHALL return one sale or 404 "Record not found" (FR-109).

> GAP: ordering and the 404 are not asserted (see docs/requirements.md Coverage gaps, FR-109 row).

#### Scenario: Unknown sale
- **WHEN** `GET /api/sales/9999` targets a missing id
- **THEN** the response is 404 "Record not found"

### Requirement: Sales are never edited or deleted

A sale document SHALL never be edited or deleted: the API offers only create, read, return and cancel (FR-110).

> GAP: structural property with no test (see docs/requirements.md Coverage gaps, FR-110 row).

#### Scenario: No update or delete endpoint
- **WHEN** a client sends `PUT` or `DELETE` to `/api/sales/{id}`
- **THEN** the request is not handled as an edit or delete (no such endpoint exists)

### Requirement: Net values on the sale

The sale response SHALL carry `refundedRevenue`, `returnedCost`, `netRevenue` (total revenue - refunds), `netCost` (total
cost - returned cost) and `netGrossProfit` (gross profit - reversed profit) (FR-111).

#### Scenario: After a partial return
- **GIVEN** a sale with revenue 480 and a return refunding 200
- **WHEN** the sale is read
- **THEN** `refundedRevenue` is 200 and `netRevenue` is 280

### Requirement: New Sale form

The New Sale form SHALL fill the unit price from the product's selling price, start at one unit, and not post a sale
needing more units than the stock holds; posting sends trimmed notes, closes the dialog and reloads (FR-112).

#### Scenario: Defaults
- **WHEN** a product is chosen in the form
- **THEN** unit price equals the product's selling price and quantity is 1

#### Scenario: Over stock
- **WHEN** the quantity exceeds the stock
- **THEN** the sale is not posted

### Requirement: Sales page calculations

The Sales page SHALL compute line prices, sale totals and net totals after returns with exact decimals, and SHALL open
the sale named in the `?saleId` query parameter (FR-113).

#### Scenario: Deep link
- **WHEN** the page is opened with `?saleId=<id>`
- **THEN** that sale's document is opened
