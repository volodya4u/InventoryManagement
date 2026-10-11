# Schema and Migration Specification

## Purpose

Describes the SQLite data model rules and the idempotent startup migration that upgrades existing local databases, plus
the data-integrity guarantees every operation relies on: transactions, check-and-set stock deduction and exact
decimals. This is an already-implemented baseline reverse-engineered from the shipped code and its tests; every
requirement is an unratified assumption.

## Requirements

### Requirement: Idempotent startup migration

On every start an idempotent migration SHALL upgrade existing databases by adding missing columns
`average_unit_cost`, `reorder_level`, `markup_percentage`, `advertising_cost_per_unit`, `advertising_cost`, `status`,
`sale_id` and `sale_return_id`, and widening the movement-type CHECK lists, and it SHALL be safe to run twice (FR-147).
A schema change goes to `schema.sql` for new databases and to an idempotent step in `InventorySchemaMigration` with a
test (TC-2).

#### Scenario: Old raw material table
- **GIVEN** an existing database whose `raw_material` table lacks the new columns
- **WHEN** the migration runs
- **THEN** the columns exist

#### Scenario: Second run
- **WHEN** the migration runs again
- **THEN** it completes without error and changes nothing

### Requirement: Opening balance for legacy stock

The migration SHALL create one `OPENING_BALANCE` movement (cost 0, note "Opening balance migrated from the existing
inventory") for each raw material or product that has stock and no movement yet (FR-148).

#### Scenario: Stocked item without movement
- **GIVEN** a raw material with quantity 5 and no movements
- **WHEN** the migration runs
- **THEN** one `OPENING_BALANCE` movement with cost 0 and that note exists
- **AND** running it again adds no second movement

### Requirement: Database rules

Database rules SHALL enforce non-negative quantities and costs, unique SKU, sale number and return number, restricted
deletes of referenced rows (recipe materials, sold products, sale documents), and foreign keys on (FR-149).

> Covered by slice `harden-infrastructure-tests`: four `InventoryFlowIntegrationTest` tests assert the CHECK rules, the unique sale and return numbers, the restricted deletes and the foreign keys by direct SQL.

#### Scenario: Duplicate SKU
- **GIVEN** a product with SKU "ROSE-1"
- **WHEN** another with the same SKU is inserted
- **THEN** the database or service rejects it

### Requirement: Transactional operations

Each business operation that touches several tables (create with opening movement, receipt, production, sale, return,
cancellation, write-off, adjustment) SHALL run in one database transaction, so a rejected operation changes nothing
(NFR-12).

#### Scenario: Rejected sale
- **GIVEN** a sale rejected for insufficient stock
- **THEN** record counts and quantities are unchanged

### Requirement: Stock deduction is check-and-set

Stock deduction SHALL be a check-and-set against the value that was read, so concurrent writers cannot drive stock
negative; the connection pool size is 1 (NFR-13).

> Covered by slice `harden-infrastructure-tests`: `StockQuantitiesTest` (a competing deduction between the read and the guarded write) and `StockDeductionConcurrencyTest` (eight threads, and the pool size) assert it.

#### Scenario: Concurrent writers
- **WHEN** two writers deduct more than the stock holds
- **THEN** at most one succeeds and stock never goes below 0

### Requirement: Persistence conventions

Persistence SHALL be SQLite through plain SQL with `JdbcTemplate`, NUMERIC columns read with `SqliteDecimals.read`,
`PRAGMA foreign_keys = ON` and a pool size of 1 (TC-2). Money and quantity values SHALL be exact decimals, with money at
2 decimals half-up and unit costs at 4 decimals half-up; the frontend uses `core/decimal.ts` and SHALL match the
server's rounding (NFR-14).

#### Scenario: Server and preview agree
- **WHEN** the same price or return cost is computed by the server and by the form preview
- **THEN** both produce the same half-up rounded value
