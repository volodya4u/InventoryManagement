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

> Covered by slice `harden-infrastructure-tests`: `InventoryFlowIntegrationTest` › `forwardsEveryBrowserRouteToTheAngularApplication` asserts all nine routes, signed out, and that an unlisted path is not forwarded.

#### Scenario: Nested report route
- **WHEN** a browser requests `/reports/monthly-sales` directly
- **THEN** the server forwards to `/index.html`

#### Scenario: Stock history route
- **WHEN** a browser requests `/stock-movements` directly
- **THEN** the server forwards to `/index.html`

### Requirement: Route table and default redirects

The pages Dashboard, Raw Materials, Products, Sales, Stock History, Monthly Sales report and Change Password SHALL sit
behind `authGuard` under the shell; `/` and any unknown path SHALL redirect to `/dashboard` (FR-34).

> Covered by slice `harden-frontend-specs`: `app.routes.spec.ts` asserts the route table, `authGuard` coverage and the default redirects.

#### Scenario: Unknown path
- **GIVEN** a signed-in user
- **WHEN** the user opens an unknown path
- **THEN** the app redirects to `/dashboard`

### Requirement: Navigation menu

The navigation menu SHALL open from the toggle and close when a link is chosen (FR-35). The layout is responsive with a
toggled mobile menu, and is checked at 375, 768 and 1280 px; a wide table scrolls inside its own frame and the frame shows a
shadow on an edge with more to scroll to (NFR-18).

> The layout is checked by `e2e/16-layout.spec.ts` and by `docs/qa/vision-report.json`, which is a model's judgement of screenshots and not deterministic (ADR-0011). No device list beyond those three widths is declared.

#### Scenario: Menu toggle
- **WHEN** the user opens the menu from the toggle and then chooses a link
- **THEN** the menu opens, and closes after the link is chosen

### Requirement: Modal keyboard focus

Every modal on the Raw Materials, Products and Sales pages SHALL move keyboard focus inside when opened, keep Tab and Shift+Tab inside it, and return focus to its opener when closed (FR-150, NFR-20). This behavior was approved after MT-28 found that focus moved to a stock action behind New Raw Material.

#### Scenario: Open and close a modal by keyboard
- **GIVEN** a keyboard user focuses a modal opener
- **WHEN** they open the modal, use Tab or Shift+Tab at its ends, then close it
- **THEN** focus enters the modal, wraps within its controls, and returns to the opener

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

> Covered by slice `harden-security-tests`: `sendsTheContentSecurityPolicyOnEveryResponse` asserts the exact policy, and `doesNotLeakStackTracesOrFrameworkMessagesInErrors` the error switches and that error bodies carry no trace.

#### Scenario: Domain error shape
- **WHEN** a domain rule rejects a request
- **THEN** the body has `title` and `detail` and no stack trace

### Requirement: Performance and browser support are undeclared

The system SHALL NOT declare a performance budget (NFR-15). The supported browsers are the current Chromium (Chrome and
Edge), Firefox and WebKit, which stands in for Safari (NFR-17, OQ-8). The raw material, product and sales lists and the report
documents are returned unpaginated; only Stock History is paged.

> GAP: no load test exists (see docs/requirements.md OQ-9). The browsers are covered by `e2e/20-browsers.spec.ts` and the whole `e2e/` suite in each of the three.

#### Scenario: Unpaginated lists
- **WHEN** a client calls `GET /api/raw-materials`, `GET /api/products` or `GET /api/sales`
- **THEN** all rows are returned in one response

### Requirement: Usability and accessibility

Destructive deletes SHALL ask for confirmation, API errors SHALL be shown in the UI through `apiErrorMessage`, and write forms
SHALL validate before sending (NFR-19). The accessibility target is WCAG 2.1 AA, checked by axe over every page in the light and the dark colour scheme
(NFR-20, OQ-15).

> The raw-materials, products and sales component specs assert invalid submissions send no request and server errors appear in their write dialogs; login and change-password specs cover their forms. Delete confirmations are asserted by FR-55 and FR-86. Accessibility is held by `e2e/18-accessibility.spec.ts` and `scripts/check-a11y.mjs` (ADR-0011); automated rules find only part of the problems, so MT-28 stays. The application has no dark theme; the dark scheme is an emulated preference.

#### Scenario: API error shown
- **WHEN** an API call fails with an error message
- **THEN** the page shows that message instead of a raw failure

### Requirement: Localization and display currency

The UI, messages and code SHALL be English only (`<html lang="en">`); amounts SHALL display as UAH with 2 decimals.
Date inputs and API values SHALL use ISO `YYYY-MM-DD`, while Sales, Monthly Sales and Stock History SHALL show readable English dates on the same calendar day; stored names work in any alphabet (NFR-21). Stored amounts SHALL carry no currency code
(NFR-22).

> `InventoryFlowIntegrationTest` asserts the entry document's language, numeric monthly-sales API amounts and no currency-code property or database column. Sales, Monthly Sales and Stock History component specs assert readable dates retain the API calendar day; the report spec asserts the UAH display (symbol shown, never the currency code; see docs/requirements.md OQ-14).

#### Scenario: Non-Latin search
- **WHEN** a name stored in Cyrillic is searched in stock history
- **THEN** it is found (covered in `stock-history`)

### Requirement: Technical constraints of the baseline

The product SHALL be Java 21 with Spring Boot 4.1.1 using feature packages under `com.flowershop.inventory.<feature>`
(TC-1), shipped as one executable JAR with the Angular production build, profile `local` by default listening on 127.0.0.1
only (NFR-23) on port 8081 with database file `flower-shop-local.db` (TC-4), with a JSON API over `/api/**` (TC-5), a frontend of Angular 22 with
Bootstrap 5, Vitest and pnpm (TC-3), and tests on in-memory SQLite run by `mvn -B -ntp verify` (TC-9).

#### Scenario: Local profile default
- **WHEN** the JAR is started without a profile argument
- **THEN** it uses profile `local`, port 8081 and the file database in the project root

#### Scenario: Only this machine can connect
- **WHEN** the JAR runs with profile `local` and a client on another machine, or this machine's other network address, tries to connect to port 8081
- **THEN** no connection is made (refused, or the attempt times out), while `127.0.0.1` answers (NFR-23)

### Requirement: Scope exclusions and business constraints

The baseline SHALL NOT include customers, suppliers, taxes or VAT, discounts, multiple currencies, multiple users or
roles other than `ADMIN`, password reset by email, imports of any kind, image formats other than JPG, JPEG and PNG, or
any export other than the Monthly Sales CSV (TC-7). Every row is MVP and no Future Phase is declared (BC-1). Changes
follow the repo's approved-spec process (BC-2), the agent's autonomy limits (BC-3), the unratified status of this
baseline (BC-4) and the single-shop, single-administrator, local-machine assumption (BC-5).

#### Scenario: Out-of-scope features are not bugs
- **WHEN** a tester looks for a customer record, a discount, a VAT field or a CSV import
- **THEN** none exists and this is expected scope, not a defect
