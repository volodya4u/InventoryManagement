# Stock History Specification

## Purpose

Describes the unified, filterable, paged history of raw material and product stock movements with totals, and the Stock
History page. This is an already-implemented baseline reverse-engineered from the shipped code and its tests; every
requirement is an unratified assumption. Movement history carries no "performed by" field.

## Requirements

### Requirement: Unified list with signed values

`GET /api/stock-movements` SHALL merge raw material and product movements into one list. Incoming types SHALL be, for
raw materials, `OPENING_BALANCE`, `RECEIPT`, `ADJUSTMENT_INCREASE`; for products, `OPENING_BALANCE`, `PRODUCTION`,
`ADJUSTMENT_INCREASE`, `SALE_RETURN`, `SALE_CANCELLATION`; everything else SHALL be outgoing. Each movement SHALL have
`signedQuantity` and `signedTotalCost`, negative when outgoing (FR-127).

> GAP: the full direction mapping is not asserted; a sale (-1) and a receipt (+50) are (see docs/requirements.md Coverage gaps, FR-127 row).

#### Scenario: Directions
- **WHEN** a `SALE` movement of 1 unit and a `RECEIPT` of total 50 are listed
- **THEN** the sale has `signedQuantity` -1 and the receipt has `signedTotalCost` +50

### Requirement: Filters

The history SHALL filter by `inventoryType` (`ALL` default, `RAW_MATERIAL`, `PRODUCT`), `movementType`, a text `query`,
and an inclusive `from`/`to` date range; the filters combine with AND (FR-128).

#### Scenario: Combined filters
- **WHEN** `inventoryType=PRODUCT` and a `from`/`to` range are given
- **THEN** only product movements dated within the range inclusive are returned

### Requirement: Text search in any alphabet

The text query SHALL match the item name or product SKU as a case-insensitive substring in any alphabet (for example
"троянда" and "ТРОЯНД" find "Троянда") (FR-129).

#### Scenario: Cyrillic query
- **GIVEN** an item named "Троянда"
- **WHEN** the query is "ТРОЯНД"
- **THEN** its movements are returned

### Requirement: Filter validation

`from` later than `to` SHALL give 400 "From date cannot be later than To date"; a trimmed query longer than 120
characters SHALL give 400 "Search text cannot exceed 120 characters"; a null query SHALL be treated as empty (FR-130).

#### Scenario: Reversed range
- **WHEN** `from=2026-08-02` and `to=2026-08-01` are sent
- **THEN** the response is 400 "From date cannot be later than To date"

#### Scenario: Long query
- **WHEN** a query of 121 characters after trimming is sent
- **THEN** the response is 400 "Search text cannot exceed 120 characters"

### Requirement: Paging

Results SHALL be paged: `page` is 0-based (default 0, at least 0), `size` defaults to 25 and SHALL be 1 to 100; the
response SHALL carry `totalElements`, `totalPages` and the page's movements (FR-131).

> GAP: the default of 25 and the size bounds are not asserted (see docs/requirements.md Coverage gaps, FR-131 row).

#### Scenario: Size 2
- **GIVEN** 4 movements
- **WHEN** `size=2` is requested
- **THEN** `totalElements` is 4 and `totalPages` is 2

### Requirement: Ordering

Movements SHALL be ordered newest first by `occurred_at`, then `created_at`, then inventory type, then movement id,
descending (FR-132).

> GAP: only that the newest is first is asserted (see docs/requirements.md Coverage gaps, FR-132 row).

#### Scenario: Newest first
- **WHEN** the list is read
- **THEN** the movement with the latest `occurred_at` is first

### Requirement: Totals over the whole filtered result

Totals SHALL cover the whole filtered result, not just the page: movement count, incoming value, outgoing value and net
value change, each in 2 decimals (FR-133).

#### Scenario: Totals
- **GIVEN** filtered movements with incoming value 110 and outgoing value 30
- **WHEN** the list is read
- **THEN** incoming is 110.00, outgoing is 30.00 and net change is 80.00 regardless of page size

#### Scenario: Empty result
- **WHEN** a query matches nothing
- **THEN** all totals are 0

### Requirement: Movement references

Product movements SHALL carry a reference: a return or cancellation points to the return number (reference type
`SALE_RETURN`, the sale id), a sale to the sale number (`SALE`), and a production to "Batch #<id>" (`PRODUCTION_BATCH`)
(FR-134).

> GAP: not asserted at API level (see docs/requirements.md Coverage gaps, FR-134 row).

#### Scenario: Production reference
- **WHEN** a `PRODUCTION` movement is listed
- **THEN** its reference is "Batch #<id>" with type `PRODUCTION_BATCH`

### Requirement: Stock History page

The Stock History page SHALL load the first page of all inventory, send only the filters that are set (trimmed search),
restart at page 0 on a new filter, page only within the result, ignore paging clicks while loading, reset filters, show
the API error and drop the old result, and link sale and return references to the Sales page; the page size is 25
(FR-135).

#### Scenario: New filter
- **GIVEN** the user is on page 2
- **WHEN** a filter changes
- **THEN** the page restarts at 0

#### Scenario: API error
- **WHEN** the history call fails
- **THEN** the API error is shown and the previous result is dropped
