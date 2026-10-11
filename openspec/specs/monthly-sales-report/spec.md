# Monthly Sales Report Specification

## Purpose

Describes the Monthly Sales report API, its net revenue, cost and profit math, payment, daily and product summaries, and
the report page with its CSV export. This is an already-implemented baseline reverse-engineered from the shipped code
and its tests; every requirement is an unratified assumption. Exports other than this CSV are intentionally unsupported.

## Requirements

### Requirement: Month parameter

`GET /api/reports/monthly-sales?month=YYYY-MM` SHALL return the report for that month, with `periodStart` the first day
and `periodEnd` the last day of the month; a value that is not `YYYY-MM` SHALL give 400 "Month must use the YYYY-MM
format" (FR-136).

#### Scenario: Valid month
- **WHEN** `month=2026-07` is requested
- **THEN** `periodStart` is 2026-07-01 and `periodEnd` is 2026-07-31

#### Scenario: Invalid month
- **WHEN** `month=July` is requested
- **THEN** the response is 400 "Month must use the YYYY-MM format"

### Requirement: Which documents belong to a month

Sales SHALL be included by their sale date; returns and cancellations by their own reversal date, not the original sale's
month; sales of other months SHALL be excluded (FR-137).

#### Scenario: Return in a later month
- **GIVEN** a sale in July and a return of it in August
- **WHEN** August is reported
- **THEN** it shows 0 sales and 1 reversal for that return

### Requirement: Document counts

`salesCount` SHALL count sale documents of the month and `returnCount` SHALL count reversal documents of the month
(FR-138).

#### Scenario: Counts
- **GIVEN** 2 sales in a month and none reversed in it
- **WHEN** the month is reported
- **THEN** `salesCount` is 2 and `returnCount` is 0

### Requirement: Net units

`unitsSold` SHALL be net units (sold minus returned in the month, so it can be negative) and `unitsReturned` SHALL be the
returned units (FR-139).

#### Scenario: Net units
- **GIVEN** 8 units sold and 2 returned in the month
- **THEN** `unitsSold` is 6 and `unitsReturned` is 2

#### Scenario: Return-only month
- **GIVEN** a month with only returns totalling 6 units
- **THEN** `unitsSold` is -6 and `unitsReturned` is 6

### Requirement: Revenue, cost and profit

`grossRevenue` SHALL be the sum of the month's sales, `refunds` the sum of the month's refunds, `revenue` = gross revenue -
refunds, `totalCost` = sale cost - returned cost, `returnedCost` the reversed cost, and `grossProfit` = `revenue` -
`totalCost`; these net values can be negative (FR-140).

#### Scenario: Reversal-only month
- **GIVEN** reversals refunding 1200 and returning cost 600 in a month with no sales
- **THEN** `revenue` is -1200, `totalCost` is -600 and `grossProfit` is -600

### Requirement: Average sale value

`averageSaleValue` SHALL equal gross revenue / number of sale documents, 2 decimals half-up, and 0.00 when there are no
sales (FR-141).

> Covered by slice `harden-sales-reports-history-tests`: `InventoryFlowIntegrationTest` › `reportsAnAverageSaleValueOfZeroWhenAMonthHasNoSales` asserts the no-sales case.

#### Scenario: Two sales
- **GIVEN** two sales with gross revenue 730
- **THEN** `averageSaleValue` is 365.00

#### Scenario: No sales
- **GIVEN** a month with no sales
- **THEN** `averageSaleValue` is 0.00

### Requirement: Payment summaries

`paymentSummaries` SHALL always have three entries in the order CASH, CARD, BANK_TRANSFER, with zero values for unused
methods; each combines the month's sales and reversals for that payment method (FR-142).

#### Scenario: Unused methods
- **GIVEN** sales paid only by CASH
- **THEN** `paymentSummaries` lists CASH, CARD, BANK_TRANSFER, with CARD and BANK_TRANSFER at zero

### Requirement: Daily, product and document lists

`dailySummaries` SHALL combine sales and reversals on the dates they were recorded, ordered by date; `productSummaries`
SHALL combine them per product, ordered by net revenue descending then product name; `sales` and `returns` SHALL list the
month's documents (FR-143).

> Covered by slice `harden-sales-reports-history-tests`: `ordersDailyAndProductSummariesByDateAndByNetRevenueThenName` asserts the daily and product orderings.

#### Scenario: Two sale days
- **GIVEN** sales on two different dates
- **THEN** `dailySummaries` has 2 entries ordered by date

### Requirement: Report page loading

The report page SHALL load the current month on open, reload when another month is picked, ignore a cleared month picker,
and show the API error while dropping the previous report (FR-144).

#### Scenario: Cleared picker
- **WHEN** the user clears the month picker
- **THEN** no new request is sent and the current report stays

### Requirement: CSV export

Export CSV SHALL download `monthly-sales-<YYYY-MM>.csv` as UTF-8 with a byte order mark and CRLF line breaks, every cell
quoted with embedded quotes doubled, in three blocks (sales, returns and cancellations, monthly net totals); nothing
SHALL be exported for a month with no sales and no returns; amount headers say "(UAH)" (FR-145).

#### Scenario: Escaped quotes
- **GIVEN** a note containing a double quote
- **WHEN** the CSV is exported
- **THEN** the cell is quoted and the embedded quote is doubled

#### Scenario: Empty month
- **WHEN** the month has no sales and no returns
- **THEN** no file is exported

### Requirement: Sale number link

A sale number in the report SHALL link to the full document on the Sales page (FR-146).

> Covered by slice `harden-frontend-specs`: `monthly-sales-report.component.spec.ts` asserts the sale-number link.

#### Scenario: Follow a link
- **WHEN** the user follows a sale number
- **THEN** the Sales page opens that sale (via `?saleId`)
