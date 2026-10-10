# App Shell and Routing Specification

## Purpose

Describes the single-page shell: server-side forwarding of browser reloads to the Angular app, the route table behind the
authentication guard, the navigation menu, the public health endpoint, and the cross-cutting security, quality and
scope constraints of the product. This is an already-implemented baseline reverse-engineered from the shipped code and
its tests; every requirement is an unratified assumption (BC-4).

## Requirements

### Requirement: SPA route forwarding

The server SHALL forward browser reloads of `/`, `/login`, `/dashboard`, `/raw-materials`, `/products`, `/sales`,
`/stock-movements`, `/change-password` and `/reports/**` to `/index.html` (FR-33). A new Angular route also needs its
path in `SpaController` and a forwarding test (TC-5).

> GAP: only two of nine forwarded routes (nested report routes and the stock history route) are covered by a forwarding
> test (see docs/requirements.md Coverage gaps, FR-33 row).

#### Scenario: Nested report route
- **WHEN** a browser requests `/reports/monthly-sales` directly
- **THEN** the server forwards to `/index.html`

#### Scenario: Stock history route
- **WHEN** a browser requests `/stock-movements` directly
- **THEN** the server forwards to `/index.html`

### Requirement: Route table and default redirects

The pages Dashboard, Raw Materials, Products, Sales, Stock History, Monthly Sales report and Change Password SHALL sit
behind `authGuard` under the shell; `/` and any unknown path SHALL redirect to `/dashboard` (FR-34).

> GAP: no test asserts the route table, guard coverage or default redirects (see docs/requirements.md Coverage gaps, FR-34 row).

#### Scenario: Unknown path
- **GIVEN** a signed-in user
- **WHEN** the user opens an unknown path
- **THEN** the app redirects to `/dashboard`

### Requirement: Navigation menu

The navigation menu SHALL open from the toggle and close when a link is chosen (FR-35). The layout is responsive with a
toggled mobile menu; no target device list is declared (NFR-18).

> GAP: CSS breakpoints at 480, 575.98, 620, 767.98, 820, 980 and 1100 px are unverified; verification tag is vision-verify with no mechanism (see docs/requirements.md Coverage gaps / OQ-8).

#### Scenario: Menu toggle
- **WHEN** the user opens the menu from the toggle and then chooses a link
- **THEN** the menu opens, and closes after the link is chosen

### Requirement: Public health endpoint

`GET /api/health` SHALL be public, return `{"status":"UP"}` and create no session (FR-36). `Start OnlineStore.cmd` waits
for this endpoint before opening the browser; no availability target, backup, restore or export of the SQLite file exists
in the application (NFR-16).

> GAP: only health is tested; availability and backup expectations are unclear (see docs/requirements.md OQ-10).

#### Scenario: Health without signing in
- **GIVEN** no session
- **WHEN** a client calls `/api/health`
- **THEN** the body is `{"status":"UP"}` and no session cookie is created

### Requirement: Content-Security-Policy and error exposure

Every response SHALL set a Content-Security-Policy of `default-src 'self'; img-src 'self' data:; style-src 'self'
'unsafe-inline'; script-src 'self'; connect-src 'self'` (NFR-6). Error responses SHALL NOT expose stack traces or raw
framework messages (`server.error.include-message: never`, `include-stacktrace: never`); controller errors use problem
details (title and detail) while filter-level 401 and 403 use a small `{"message": ...}` JSON (NFR-9).

> GAP: the CSP header and the error configuration switches are not asserted; tests assert `title` and `detail` for
> domain errors only (see docs/requirements.md Coverage gaps, NFR-6 and NFR-9 rows).

#### Scenario: Domain error shape
- **WHEN** a domain rule rejects a request
- **THEN** the body has `title` and `detail` and no stack trace

### Requirement: Performance and browser support are undeclared

The system SHALL NOT declare a performance budget or a supported browser list (NFR-15, NFR-17). The raw material,
product and sales lists and the report documents are returned unpaginated; only Stock History is paged.

> GAP: no load test and no browser list exist (see docs/requirements.md OQ-8 / OQ-9).

#### Scenario: Unpaginated lists
- **WHEN** a client calls `GET /api/raw-materials`, `GET /api/products` or `GET /api/sales`
- **THEN** all rows are returned in one response

### Requirement: Usability and accessibility

Destructive deletes SHALL ask for confirmation, API errors SHALL be shown in the UI through `apiErrorMessage`, and forms
SHALL validate before sending (NFR-19). The templates carry ARIA attributes and labels but no accessibility target or
automated gate exists (NFR-20).

> GAP: delete confirmations are not asserted; accessibility target unknown (see docs/requirements.md OQ-15).

#### Scenario: API error shown
- **WHEN** an API call fails with an error message
- **THEN** the page shows that message instead of a raw failure

### Requirement: Localization and display currency

The UI, messages and code SHALL be English only (`<html lang="en">`); amounts SHALL display as UAH with 2 decimals and
dates as ISO `YYYY-MM-DD`; stored names work in any alphabet (NFR-21). Stored amounts SHALL carry no currency code
(NFR-22).

> GAP: UAH display formatting and the display-only currency are not asserted (see docs/requirements.md OQ-14 / Coverage gaps, NFR-21 and NFR-22 rows).

#### Scenario: Non-Latin search
- **WHEN** a name stored in Cyrillic is searched in stock history
- **THEN** it is found (covered in `stock-history`)

### Requirement: Technical constraints of the baseline

The product SHALL be Java 21 with Spring Boot 4.1.1 using feature packages under `com.flowershop.inventory.<feature>`
(TC-1), shipped as one executable JAR with the Angular production build, profile `local` by default on port 8081 with
database file `flower-shop-local.db` (TC-4), with a JSON API over `/api/**` (TC-5), a frontend of Angular 22 with
Bootstrap 5, Vitest and pnpm (TC-3), and tests on in-memory SQLite run by `mvn -B -ntp verify` (TC-9).

#### Scenario: Local profile default
- **WHEN** the JAR is started without a profile argument
- **THEN** it uses profile `local`, port 8081 and the file database in the project root

### Requirement: Scope exclusions and business constraints

The baseline SHALL NOT include customers, suppliers, taxes or VAT, discounts, multiple currencies, multiple users or
roles other than `ADMIN`, password reset by email, imports of any kind, image formats other than JPG, JPEG and PNG, or
any export other than the Monthly Sales CSV (TC-7). Every row is MVP and no Future Phase is declared (BC-1). Changes
follow the repo's approved-spec process (BC-2), the agent's autonomy limits (BC-3), the unratified status of this
baseline (BC-4) and the single-shop, single-administrator, local-machine assumption (BC-5).

#### Scenario: Out-of-scope features are not bugs
- **WHEN** a tester looks for a customer record, a discount, a VAT field or a CSV import
- **THEN** none exists and this is expected scope, not a defect
