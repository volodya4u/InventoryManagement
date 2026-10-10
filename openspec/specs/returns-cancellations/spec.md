# Returns and Cancellations Specification

## Purpose

Describes partial and full returns of sold products and whole-sale cancellations: validation, refund and returned-cost
math, stock restoration with weighted-average re-blending, reversal numbering, status transitions and the Sales page
dialogs. This is an already-implemented baseline reverse-engineered from the shipped code and its tests; every
requirement is an unratified assumption.

## Requirements

### Requirement: Return input

`POST /api/sales/{id}/returns` SHALL take `returnDate`, `reason` (required, at most 200), optional `notes` (at most 1000)
and a non-empty list of items, each a distinct `saleItemId` of that sale with a whole quantity greater than 0 (FR-114).

> GAP: duplicate item, foreign item and blank reason rejections are not asserted (see docs/requirements.md Coverage gaps, FR-114 row).

#### Scenario: Valid return
- **GIVEN** a completed sale
- **WHEN** a return of 1 unit of one sale item is posted with a reason
- **THEN** a reversal is created

#### Scenario: Blank reason
- **WHEN** a return is posted with a blank reason
- **THEN** the request is rejected with 400 (code-level behavior, not test-verified)

### Requirement: Remaining returnable quantity

A returned quantity SHALL NOT exceed the item's remaining unreturned quantity; otherwise the response SHALL be 400
"Return quantity for <product> exceeds the remaining returnable quantity <n>" and nothing SHALL be saved (FR-115).

#### Scenario: Over-return
- **GIVEN** a sale item of 2 units of which 1 was already returned
- **WHEN** a return of 2 units is posted
- **THEN** the response is 400 "Return quantity for <product> exceeds the remaining returnable quantity 1"

### Requirement: Closed sales accept no returns

A cancelled sale SHALL accept no returns (400 "A cancelled sale cannot receive Product returns") and a fully returned
sale SHALL accept none (400 "All Products from this sale have already been returned") (FR-116).

> GAP: not asserted by any test (see docs/requirements.md Coverage gaps, FR-116 row).

#### Scenario: Return on a cancelled sale
- **GIVEN** a `CANCELLED` sale
- **WHEN** a return is posted
- **THEN** the response is 400 "A cancelled sale cannot receive Product returns"

#### Scenario: Return on a fully returned sale
- **GIVEN** a `RETURNED` sale
- **WHEN** a return is posted
- **THEN** the response is 400 "All Products from this sale have already been returned"

### Requirement: Reversal date not before the sale date

A return or cancellation date earlier than the sale date SHALL be rejected with 400 "<Return date or Cancellation date>
cannot be earlier than the sale date" (FR-117).

> GAP: not asserted; other date limits are absent by design (see docs/requirements.md OQ-4 / Coverage gaps, FR-117 row).

#### Scenario: Early return date
- **GIVEN** a sale dated 2026-07-21
- **WHEN** a return dated 2026-07-20 is posted
- **THEN** the response is 400 "Return date cannot be earlier than the sale date"

### Requirement: Reversal numbering and contents

Each reversal SHALL get a unique number `RET-YYYYMMDD-NNNN`, built like the sale number but from the reversal date, and
SHALL store date, reason, notes, items, refund, returned cost and reversed gross profit (FR-118).

> GAP: incrementing within a date is not asserted (see docs/requirements.md Coverage gaps, FR-118 row).

#### Scenario: First reversal of a date
- **WHEN** the first return dated 2026-08-02 is created
- **THEN** its number is `RET-20260802-0001`

### Requirement: Refund amount

The refund for a returned item SHALL equal round2(returned quantity x the original actual unit price) (FR-119).

#### Scenario: One unit at 200
- **GIVEN** an item sold at actual unit price 200
- **WHEN** 1 unit is returned
- **THEN** the refund is 200.00

### Requirement: Returned cost reverses the recorded cost proportionally

The returned cost SHALL reverse the recorded line cost proportionally: round2(lineCost x (unitsReturnedSoFar + this
return) / soldQuantity) minus cost already reversed, never below 0, so returning units one by one reverses exactly the
whole recorded line cost, with half-up rounding (FR-120).

#### Scenario: One by one
- **GIVEN** a line of 3 units with unit cost 0.3333 and recorded line cost 1.00
- **WHEN** the units are returned one at a time
- **THEN** the returned costs are 0.33, 0.34 and 0.33 and sum to 1.00

#### Scenario: Half-up
- **GIVEN** a computed value of 2.125
- **WHEN** it is rounded
- **THEN** it is 2.13

### Requirement: Stock restoration and cost re-blending

Returned units SHALL go back into product stock, and the product's `averageUnitCost` SHALL be re-blended as
(currentQuantity x currentAverage + returnedQuantity x recorded sale unit cost) / newQuantity, rounded to 4 decimals
half-up (FR-121).

> GAP: whether this matches the README's wording about restoring at the recorded sale cost is unclear (see docs/requirements.md OQ-16).

#### Scenario: Partial return re-blends
- **GIVEN** product stock and a returned quantity with a recorded sale unit cost differing from the current average
- **WHEN** the return is posted
- **THEN** the new average is the quantity-weighted blend, for example 2.6667 in the unit test case

#### Scenario: Equal costs
- **GIVEN** the recorded sale unit cost equals the current average of 100
- **WHEN** units are returned
- **THEN** the average stays 100

### Requirement: Return movements

Each returned item SHALL record a `SALE_RETURN` movement (or `SALE_CANCELLATION` for a cancellation) with note "Return
<RET number> for <SALE number>" (or "Cancellation ...") (FR-122).

#### Scenario: Movements recorded
- **WHEN** a return is posted
- **THEN** one `SALE_RETURN` movement per returned item exists with note "Return <RET number> for <SALE number>"

### Requirement: Sale status after a return

After a return the sale status SHALL be `RETURNED` when every remaining unit is returned, otherwise
`PARTIALLY_RETURNED` (FR-123).

#### Scenario: Partial then full
- **GIVEN** a completed sale of 2 units
- **WHEN** 1 unit is returned, then the second
- **THEN** the status is `PARTIALLY_RETURNED` and then `RETURNED`

### Requirement: Cancellation

`POST /api/sales/{id}/cancellation` SHALL take `cancellationDate`, `reason` (required, at most 200) and optional `notes`;
it SHALL reverse every item of a sale whose status is `COMPLETED`, create a reversal of type `CANCELLATION` and set status
`CANCELLED` (FR-124).

#### Scenario: Cancel a completed sale
- **GIVEN** a `COMPLETED` sale
- **WHEN** it is cancelled with a reason
- **THEN** a `CANCELLATION` reversal exists, all items are restored to stock and the status is `CANCELLED`

### Requirement: Only completed sales without returns can be cancelled

A sale that is not `COMPLETED` (it has had any return, or is cancelled) SHALL NOT be cancelled: 400 "Only a completed
sale without previous returns can be cancelled", and nothing SHALL be saved (FR-125).

#### Scenario: Sale with a return
- **GIVEN** a sale with a previous return
- **WHEN** a cancellation is posted
- **THEN** the response is 400 "Only a completed sale without previous returns can be cancelled"

### Requirement: Sales page return and cancel actions

The Sales page SHALL offer returns only for `COMPLETED` and `PARTIALLY_RETURNED` sales and cancellation only for
`COMPLETED`; the return dialog SHALL list only items with units left, block returning more than remains, and ask for a
quantity instead of posting an empty return (FR-126).

#### Scenario: Action availability
- **WHEN** a `PARTIALLY_RETURNED` sale is shown
- **THEN** Return is offered and Cancel is not

#### Scenario: Empty return
- **WHEN** the user submits a return with no quantity
- **THEN** the dialog asks for a quantity and posts nothing
