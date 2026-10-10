# Requirements Document

**Flower Shop Inventory** (baseline reverse-engineered from the shipped code)

*Prepared for spec-driven delivery. Every row below is an ASSUMPTION: it was inferred from code, tests, the README and
the one approved spec, and is not confirmed until the product owner ratifies the baseline.*

## 1 Company Business Overview

Flower Shop Inventory is a local inventory and sales system for one flower shop run by a single administrator. The shop
buys raw materials (flowers, ribbon, moss, packaging, decorations), makes finished products from fixed recipes, and sells
them. The features (weighted-average costing, atomic production and sales, audited stock movements, a monthly sales
report) show that the shop needs one trustworthy record of stock, cost and profit.

The platform runs on the owner's machine as one Spring Boot JAR with the Angular UI embedded, on `http://localhost:8081`,
storing data in a SQLite file. One `ADMIN` user signs in with a session. Money is shown in UAH. The UI is English.

**MVP** is everything described here, because it is already implemented. **Future Phase**: none is declared in the
README, the specs or the code. Declared out of scope (spec `docs/specs/raw-material-reorder-level.md`): automatic
reordering, supplier notifications, purchase orders, and a reorder level for finished products.

## 2 Functional Requirements (FR)

Phase is `MVP` for every row (it exists). Verification uses the closed vocabulary of the template. Each row gives an
**Evidence** reference: an existing test, verified by reading it. `GAP` means no test asserts the behavior;
`PARTIAL` means a test touches it but does not assert the stated detail. Every GAP and PARTIAL row is repeated in
`## Coverage gaps`.

Test abbreviations (all under `src/test/java/com/flowershop/inventory/` unless noted):

| Abbrev | Meaning |
|---|---|
| IT | `InventoryFlowIntegrationTest` (MockMvc plus in-memory SQLite) |
| RMS | `inventory/RawMaterialServiceTest` |
| PS | `inventory/ProductServiceTest` |
| SS | `sales/SaleServiceTest` |
| MSR | `reports/MonthlySalesReportServiceTest` |
| SMS | `stock/StockMovementServiceTest` |
| IV | `image/ImageValidatorTest` |
| LAI | `auth/LocalAdminInitializerTest` |
| SDT | `common/SqliteDecimalsTest` |
| ISM | `config/InventorySchemaMigrationTest` |
| FE:`x` | Vitest spec `frontend/src/app/x` (for example `FE:core/session.interceptor.spec.ts`) |

Source references are given as file paths under `src/main/java/com/flowershop/inventory/` (short form `…/`) or `frontend/src/app/`.

### 2.1 Authentication and password

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-1 | MVP | Auth | ASSUMPTION: `POST /api/auth/login` with non-blank `username` and `password` signs the user in and returns `{username, role}` with role `ADMIN`. Source `…/auth/AuthController.java`. Evidence: IT›authenticatesAdminAndStoresValidatedPngAsBlob. | local-verifiable |
| FR-2 | MVP | Auth | ASSUMPTION: Username matching is case-insensitive (`app_user.username` is `COLLATE NOCASE` and unique). Source `schema.sql`. Evidence: GAP. | local-verifiable |
| FR-3 | MVP | Auth | ASSUMPTION: A wrong password, unknown username, or disabled user is rejected with HTTP 401 and the single message "Invalid username or password". Evidence: PARTIAL (IT›changesTheAuthenticatedAdminPasswordAndEndsAllSessions asserts 401 for the old password only; message text and the disabled-user branch are not asserted). | local-verifiable |
| FR-4 | MVP | Auth | ASSUMPTION: Every `/api/**` path except `/api/auth/login`, `/api/auth/csrf`, `/api/health` and `/error` requires role `ADMIN`. An unauthenticated call gets 401 `{"message":"Authentication required"}`; an authenticated call without the role gets 403 `{"message":"Access denied"}`. Source `…/config/SecurityConfig.java`. Evidence: PARTIAL (IT›authenticatesAdminAndStoresValidatedPngAsBlob asserts 401 status only; no test for the 403 path or the JSON bodies). | local-verifiable |
| FR-5 | MVP | Auth | ASSUMPTION: `GET /api/auth/csrf` returns `{token, headerName}` and sets the `XSRF-TOKEN` cookie that the client echoes in header `X-XSRF-TOKEN`. Evidence: IT (the `login` helper and every write test use it). | local-verifiable |
| FR-6 | MVP | Auth | ASSUMPTION: A state-changing request without a valid CSRF token is rejected (403). Evidence: GAP (only the positive path is exercised). | local-verifiable |
| FR-7 | MVP | Auth | ASSUMPTION: `GET /api/auth/me` returns the signed-in user, or 401 when there is no session. Evidence: IT›reportsTheActualSessionTimeoutWithoutCreatingAnonymousSessions; FE:core/auth.service.spec.ts "loads the authenticated user and stores it in the session signal". | local-verifiable |
| FR-8 | MVP | Auth | ASSUMPTION: `POST /api/auth/logout` returns 204 and invalidates the server session. Evidence: GAP (no backend test). | local-verifiable |
| FR-9 | MVP | Auth | ASSUMPTION: The Sign out action in the shell calls logout once, clears local session state, and goes to `/login` even when the logout call fails. Evidence: FE:layout/shell.component.spec.ts "signs out once and goes to the login page", "still goes to the login page when signing out fails"; FE:core/auth.service.spec.ts "logs out and clears all local session state". | local-verifiable |
| FR-10 | MVP | Auth | ASSUMPTION: `POST /api/auth/change-password` rejects a wrong current password with 400 "Current password is incorrect". Evidence: IT›changesTheAuthenticatedAdminPasswordAndEndsAllSessions. | local-verifiable |
| FR-11 | MVP | Auth | ASSUMPTION: The new password must be 10 to 64 characters, otherwise 400 "New password must be between 10 and 64 characters". Evidence: IT›changesTheAuthenticatedAdminPasswordAndEndsAllSessions (9 and 65 characters); FE:change-password/change-password.component.spec.ts "requires a new password of 10 to 64 characters". | local-verifiable |
| FR-12 | MVP | Auth | ASSUMPTION: A confirmation that differs from the new password is rejected with 400 "New password confirmation does not match". Evidence: PARTIAL (FE:change-password/change-password.component.spec.ts "does not send a confirmation that differs from the new password" covers the client only). | local-verifiable |
| FR-13 | MVP | Auth | ASSUMPTION: A new password equal to the current one is rejected with 400 "New password must be different from current password". Evidence: GAP. | local-verifiable |
| FR-14 | MVP | Auth | ASSUMPTION: A successful password change returns 204, stores a new bcrypt hash, expires every session of that user (current and other browsers, which then get 401 "Your session has ended. Please sign in again."), and only the new password signs in afterwards. Evidence: IT›changesTheAuthenticatedAdminPasswordAndEndsAllSessions. | local-verifiable |
| FR-15 | MVP | Auth | ASSUMPTION: After a successful change the UI ends the session and shows the login page with "Password changed successfully. Sign in with your new password." Evidence: FE:change-password/change-password.component.spec.ts "changes the password, ends the session and asks to sign in again"; FE:login/login.component.spec.ts "tells the user the password was changed". | local-verifiable |
| FR-16 | MVP | Auth | ASSUMPTION: When the change fails, the UI shows the server error and keeps the session. Evidence: FE:change-password/change-password.component.spec.ts "shows the server error and keeps the session". | local-verifiable |
| FR-17 | MVP | Auth | ASSUMPTION: On startup in profile `local`, if no user named `APP_ADMIN_INITIAL_USERNAME` (default `admin`) exists, one `ADMIN` is created with the bcrypt hash of `APP_ADMIN_INITIAL_PASSWORD`. Source `…/auth/LocalAdminInitializer.java`. Evidence: LAI›hashesAndInsertsMissingAdministrator. | local-verifiable |
| FR-18 | MVP | Auth | ASSUMPTION: If no administrator exists and `APP_ADMIN_INITIAL_PASSWORD` is blank, startup fails with an error naming that variable; no default password exists. Evidence: LAI›requiresInitialPasswordWhenAdministratorDoesNotExist. | local-verifiable |
| FR-19 | MVP | Auth | ASSUMPTION: When the administrator already exists, startup leaves the user and password untouched. Evidence: LAI›leavesExistingAdministratorUnchanged. | local-verifiable |
| FR-20 | MVP | Auth | ASSUMPTION: The login form pre-fills username `admin`, sends the trimmed username, and does not send an empty password. Source `frontend/src/app/login/login.component.ts`. Evidence: FE:login/login.component.spec.ts "signs in with the trimmed username and opens the dashboard", "does not send an empty password". | local-verifiable |
| FR-21 | MVP | Auth | ASSUMPTION: A failed sign-in shows the server's reason and stays on the login page. Evidence: FE:login/login.component.spec.ts "shows why signing in failed and stays on the page". | local-verifiable |
| FR-22 | MVP | Auth | ASSUMPTION: The login password field has a reveal toggle that hides the password again after 5 seconds. Evidence: FE:login/login.component.spec.ts "shows the password for five seconds". | local-verifiable |

### 2.2 Session lifetime

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-23 | MVP | Session | ASSUMPTION: Controller responses that have a body and are made with a session carry header `X-Session-Timeout-Seconds` equal to the session's max inactive interval; responses without a session carry none (no anonymous sessions are created). Source `…/auth/SessionTimeoutAdvice.java`. Evidence: IT›reportsTheActualSessionTimeoutWithoutCreatingAnonymousSessions. | local-verifiable |
| FR-24 | MVP | Session | ASSUMPTION: An idle page returns to sign-in when the server timeout elapses, with no keep-alive requests sent. Evidence: FE:core/session.interceptor.spec.ts "clears an idle view at the server timeout without sending keep-alive requests". | local-verifiable |
| FR-25 | MVP | Session | ASSUMPTION: API activity renews the browser deadline, including activity in another tab sharing the session (shared `localStorage` key `flower-shop.session-expiry`). Evidence: FE:core/session.interceptor.spec.ts "renews the deadline on API activity", "uses activity from another tab even if its storage event was delayed". | local-verifiable |
| FR-26 | MVP | Session | ASSUMPTION: A 401 on a protected request clears authentication at once and redirects to `/login?sessionExpired=true`, which shows "Your session has ended. Please sign in again." Evidence: FE:core/session.interceptor.spec.ts "immediately clears authentication on a rejected protected request"; FE:login/login.component.spec.ts "tells the user the session has ended". | local-verifiable |
| FR-27 | MVP | Session | ASSUMPTION: Before sending a write (non-GET) request, the client confirms the server session with `GET /api/auth/me` and checks its local deadline; if the session is gone it closes the protected form and shows no form error. Evidence: FE:core/session.interceptor.spec.ts "blocks Save before sending anything when the expiry timer has not run yet", "closes the view without showing a form error if the session expires during Save"; FE:core/session-navigation.spec.ts "removes the material form and goes to login when the pre-save session check fails". | local-verifiable |
| FR-28 | MVP | Session | ASSUMPTION: Protected child routes recheck authentication on each navigation (`authGuard` calls `/api/auth/me`; failure redirects to `/login`). Evidence: FE:core/session-navigation.spec.ts "rechecks authentication when moving between protected child pages". | local-verifiable |
| FR-29 | MVP | Session | ASSUMPTION: After a 403 on a write, the client rechecks the session: it redirects if the session is gone and keeps it on a genuine permission or CSRF failure. Evidence: FE:core/session.interceptor.spec.ts "checks authentication after a forbidden write and redirects if the session is gone", "keeps a valid session after a genuine permission or CSRF failure". | local-verifiable |
| FR-30 | MVP | Session | ASSUMPTION: Network errors, 5xx errors, and wrong login credentials do not end the session. Evidence: FE:core/session.interceptor.spec.ts "does not log out on network or server errors", "does not treat wrong login credentials as expiry". | local-verifiable |
| FR-31 | MVP | Session | ASSUMPTION: Signing out in one tab clears protected views in other tabs, and a suspended tab whose deadline has passed is cleared when it regains focus. Evidence: FE:core/session.interceptor.spec.ts "clears the view when another tab signs out", "clears a suspended view on focus when its deadline has passed". | local-verifiable |
| FR-32 | MVP | Session | ASSUMPTION: A response that arrives after sign-out or expiry cannot restore authentication or restart timers. Evidence: FE:core/session.interceptor.spec.ts "cannot restore authentication from an in-flight response after expiry". | local-verifiable |

### 2.3 Application shell, routing and health

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-33 | MVP | Shell | ASSUMPTION: The server forwards browser reloads of `/`, `/login`, `/dashboard`, `/raw-materials`, `/products`, `/sales`, `/stock-movements`, `/change-password` and `/reports/**` to `/index.html`. Source `…/config/SpaController.java`. Evidence: PARTIAL (IT›forwardsNestedReportRoutesToTheAngularApplication and IT›forwardsTheStockHistoryRouteToTheAngularApplication cover two of the nine). | local-verifiable |
| FR-34 | MVP | Shell | ASSUMPTION: The pages Dashboard, Raw Materials, Products, Sales, Stock History, Monthly Sales report and Change Password sit behind `authGuard` under the shell; `/` and any unknown path redirect to `/dashboard`. Source `frontend/src/app/app.routes.ts`. Evidence: GAP. | local-verifiable |
| FR-35 | MVP | Shell | ASSUMPTION: The navigation menu opens from the toggle and closes when a link is chosen. Evidence: FE:layout/shell.component.spec.ts "opens the menu from the toggle and closes it from a link". | local-verifiable |
| FR-36 | MVP | Health | ASSUMPTION: `GET /api/health` is public, returns `{"status":"UP"}`, and creates no session. Evidence: IT›reportsHealthWithoutSigningInOrCreatingASession. | local-verifiable |

### 2.4 Dashboard

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-37 | MVP | Dashboard | ASSUMPTION: `GET /api/dashboard` returns `rawMaterialTypes` (count of raw materials), `productTypes` (count of products) and `productUnits` (sum of product quantities). Source `…/inventory/DashboardController.java`. Evidence: GAP. | local-verifiable |
| FR-38 | MVP | Dashboard | ASSUMPTION: `salesCount` counts sales whose status is not `CANCELLED` (so `RETURNED` and `PARTIALLY_RETURNED` sales are counted). Source `…/sales/SaleRepository.java` `count()`. Evidence: PARTIAL (IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots asserts count 1; the cancelled exclusion is not asserted). | local-verifiable |
| FR-39 | MVP | Dashboard | ASSUMPTION: `lowStockRawMaterials` counts raw materials with `reorder_level > 0 AND quantity <= reorder_level` (the boundary counts; reorder level 0 is excluded). Evidence: IT›dashboardCountsLowStockRawMaterials. Approved spec acceptance criterion 3. | local-verifiable |
| FR-40 | MVP | Dashboard | ASSUMPTION: The dashboard page shows the inventory summary and a "Low Stock" card with the low-stock count. Evidence: FE:dashboard/dashboard.component.spec.ts "shows the inventory summary", "shows the low-stock raw material count". | local-verifiable |
| FR-41 | MVP | Dashboard | ASSUMPTION: When the summary call fails, the dashboard shows the API error instead of numbers, and it can be reloaded, clearing the previous error. Evidence: FE:dashboard/dashboard.component.spec.ts "shows the API error instead of the numbers", "loads again on demand and clears the previous error". | local-verifiable |

### 2.5 Raw material catalog

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-42 | MVP | Raw materials | ASSUMPTION: `POST /api/raw-materials` (multipart) creates a raw material with `name` (required, at most 120 characters, trimmed), `description` (at most 1000 characters, default empty, trimmed), `unit`, `quantity` (at least 0) and optional `initialUnitCost`, `reorderLevel`, `image`. Source `…/inventory/RawMaterialController.java`. Evidence: RMS›createsMaterialAndRecordsOpeningStock (trimming); IT›authenticatesAdminAndStoresValidatedPngAsBlob. Length limits and the negative-quantity rejection: PARTIAL. | local-verifiable |
| FR-43 | MVP | Raw materials | ASSUMPTION: The unit is one of PIECE, BUNCH, GRAM, KILOGRAM, METER, PACKAGE (matched case-insensitively); any other value gives 400 "Unsupported measurement unit". Source `…/inventory/MeasurementUnit.java`. Evidence: RMS›createsMaterialAndRecordsOpeningStock ("piece" accepted). The rejection: PARTIAL. | local-verifiable |
| FR-44 | MVP | Raw materials | ASSUMPTION: Initial unit cost is required when the initial quantity is greater than zero (400 "Initial unit cost is required when initial stock is greater than zero") and optional (treated as 0) when the quantity is zero. Evidence: RMS›requiresUnitCostWhenOpeningStockIsPositive. | local-verifiable |
| FR-45 | MVP | Raw materials | ASSUMPTION: The initial unit cost is rounded to 4 decimals half-up and becomes the raw material's `averageUnitCost`. Evidence: RMS›createsMaterialAndRecordsOpeningStock (1.23456 becomes 1.2346); IT›authenticatesAdminAndStoresValidatedPngAsBlob (12.50). | local-verifiable |
| FR-46 | MVP | Raw materials | ASSUMPTION: Creating a raw material with initial quantity above zero records an `OPENING_BALANCE` movement (quantity, unit cost, total, note "Initial stock", dated today by server clock); a zero quantity records none. Evidence: RMS›createsMaterialAndRecordsOpeningStock (positive case). The zero-quantity case: PARTIAL. | local-verifiable |
| FR-47 | MVP | Raw materials | ASSUMPTION: `stockValue` = quantity × averageUnitCost, rounded to 2 decimals half-up. Evidence: IT›authenticatesAdminAndStoresValidatedPngAsBlob (150.0, 310.0). | local-verifiable |
| FR-48 | MVP | Raw materials | ASSUMPTION: `GET /api/raw-materials` lists all raw materials ordered by name, case-insensitive. Evidence: GAP (ordering not asserted). | local-verifiable |
| FR-49 | MVP | Raw materials | ASSUMPTION: `PUT /api/raw-materials/{id}` updates name, description, unit, reorder level and optionally the image. It has no quantity or cost input, so the regular edit cannot change stock. An unknown id gives 404. Evidence: IT›keepsTheUnitOfRawMaterialsWhoseQuantitiesAreAlreadyRecorded (rename). The 404: PARTIAL. | local-verifiable |
| FR-50 | MVP | Raw materials | ASSUMPTION: The unit can change only while `unitChangeable` is true (quantity is 0, no stock movement exists, and no recipe uses it); otherwise 409 "The unit of “<name>” cannot be changed because stock, stock history, or recipes already use it. Create a new raw material for the new unit instead." Evidence: IT›keepsTheUnitOfRawMaterialsWhoseQuantitiesAreAlreadyRecorded. | local-verifiable |
| FR-51 | MVP | Raw materials | ASSUMPTION: The raw material list exposes `unitChangeable`, `hasImage`, `stockValue`, `reorderLevel` and `belowReorderLevel`. Evidence: IT›keepsTheUnitOfRawMaterialsWhoseQuantitiesAreAlreadyRecorded (`unitChangeable`); IT›recordsRawMaterialReorderLevelAndLowStockFlag. | local-verifiable |
| FR-52 | MVP | Raw materials | ASSUMPTION: Deleting a raw material that appears in a product recipe is rejected with 409 "Raw material “<name>” is used in the recipe of <product names>. Remove it from the recipe before deleting it." Evidence: IT›rejectsDuplicateSkusAndDeletingRecordsThatAreInUse; RMS›refusesToDeleteMaterialUsedByARecipe. | local-verifiable |
| FR-53 | MVP | Raw materials | ASSUMPTION: Deleting a raw material consumed by any production batch is rejected with 409 "Raw material “<name>” cannot be deleted because production batches have consumed it." Evidence: IT›rejectsDuplicateSkusAndDeletingRecordsThatAreInUse. | local-verifiable |
| FR-54 | MVP | Raw materials | ASSUMPTION: Deleting an unused raw material returns 204; its stock movements are removed with it (`ON DELETE CASCADE`). Evidence: PARTIAL (IT›rejectsDuplicateSkusAndDeletingRecordsThatAreInUse asserts 204; the movement cascade is not asserted). | local-verifiable |
| FR-55 | MVP | Raw materials | ASSUMPTION: The UI asks "Delete raw material “<name>”?" via a browser confirm before deleting. Source `frontend/src/app/raw-materials/raw-materials.component.ts`. Evidence: GAP. | local-verifiable |
| FR-56 | MVP | Raw materials | ASSUMPTION: Raw material names are not required to be unique (the schema has no unique constraint on `raw_material.name`). Evidence: GAP; see Open question OQ-3. | local-verifiable |

### 2.6 Reorder level and low stock

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-57 | MVP | Reorder level | A raw material has an optional `reorderLevel` (numeric, at least 0, default 0 when omitted) editable on create and update; 0 means "not tracked". Source spec `docs/specs/raw-material-reorder-level.md` (approved; ASSUMPTION only that it still matches the code, which it does). Evidence: IT›recordsRawMaterialReorderLevelAndLowStockFlag; ISM›migratesAnExistingRawMaterialTableAndIsIdempotent. | local-verifiable |
| FR-58 | MVP | Reorder level | `belowReorderLevel` is true exactly when `reorderLevel > 0` and `quantity <= reorderLevel`. Evidence: IT›recordsRawMaterialReorderLevelAndLowStockFlag; IT›dashboardCountsLowStockRawMaterials. | local-verifiable |
| FR-59 | MVP | Reorder level | The raw material list shows a "Low stock" badge on rows with `belowReorderLevel = true`. Evidence: FE:raw-materials/raw-materials.component.spec.ts "marks a raw material below its reorder level". | local-verifiable |
| FR-60 | MVP | Reorder level | The reorder level is advisory only: it changes no stock, valuation, production, sales or movement logic. Evidence: GAP (stated in the spec; no negative test). | local-verifiable |

### 2.7 Raw material receipts, write-offs and adjustments

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-61 | MVP | Raw stock | ASSUMPTION: `POST /api/raw-materials/{id}/receipts` takes `receivedQuantity` (greater than 0), `unitPurchaseCost` (at least 0), `receiptDate` (required) and optional `notes` (at most 1000). Evidence: RMS›receivesStockUsingWeightedAverageCost; IT›authenticatesAdminAndStoresValidatedPngAsBlob. Validation rejections: PARTIAL. | local-verifiable |
| FR-62 | MVP | Raw stock | ASSUMPTION: A receipt sets the new `averageUnitCost` = (currentQuantity × currentAverage + receivedQuantity × unitCost) / newQuantity, rounded to 4 decimals half-up, and raises the quantity. Example: 10 at 20 plus 5 at 26 gives 22. Evidence: RMS›receivesStockUsingWeightedAverageCost; IT›authenticatesAdminAndStoresValidatedPngAsBlob (20 units at 15.5). | local-verifiable |
| FR-63 | MVP | Raw stock | ASSUMPTION: A receipt records a `RECEIPT` movement with the received quantity, unit cost rounded to 4 decimals, total = quantity × unit cost, the receipt date and trimmed notes. Evidence: RMS›receivesStockUsingWeightedAverageCost; IT›authenticatesAdminAndStoresValidatedPngAsBlob (2 movements). | local-verifiable |
| FR-64 | MVP | Raw stock | ASSUMPTION: `POST /api/raw-materials/{id}/write-offs` takes `quantity` (greater than 0), `operationDate`, `reason` (required, at most 200) and optional `notes` (at most 1000). It reduces the quantity, keeps the average unit cost, and records a `WRITE_OFF` movement valued at that average cost with notes "Reason: <reason>. <notes>" (or "Reason: <reason>" when notes are empty). Evidence: IT›writesOffAndAdjustsRawMaterialAndProductStock (7.5 left, value 150, movement total 50, note text). | local-verifiable |
| FR-65 | MVP | Raw stock | ASSUMPTION: A write-off larger than the balance is rejected with 409 "Insufficient raw material stock" plus a `shortages` list (required, available, missing quantity) and changes nothing. Evidence: RMS›rejectsWriteOffWhenStockIsInsufficient; IT›writesOffAndAdjustsRawMaterialAndProductStock. | local-verifiable |
| FR-66 | MVP | Raw stock | ASSUMPTION: `POST /api/raw-materials/{id}/adjustments` sets the quantity to `actualQuantity` (at least 0) and records the difference as `ADJUSTMENT_INCREASE` or `ADJUSTMENT_DECREASE` at the current average unit cost, leaving that average unchanged. Evidence: IT›writesOffAndAdjustsRawMaterialAndProductStock (7.5 to 9, then 4). | local-verifiable |
| FR-67 | MVP | Raw stock | ASSUMPTION: An adjustment whose actual quantity equals the recorded quantity is rejected with 400 "Actual stock already matches the recorded raw material stock". Evidence: GAP. | local-verifiable |
| FR-68 | MVP | Raw stock | ASSUMPTION: Raw material quantities may be fractional (for example 0.8 m, 2.5 kg); stock is read and subtracted with exact decimals so floating-point drift such as 1 − 0.8 never reaches the API. Source `…/common/SqliteDecimals.java`, `…/inventory/StockQuantities.java`. Evidence: SDT (all 3 tests); IT›readsAndConsumesFloatingPointDriftedStockAsExactDecimals. | local-verifiable |
| FR-69 | MVP | Raw stock | ASSUMPTION: The Raw Materials page computes initial stock value, receipt total, write-off and adjustment values, and the total stock value of all materials with exact decimal arithmetic (`core/decimal.ts`). Evidence: FE:raw-materials/raw-materials.component.spec.ts ("values a write-off…", "values a stock adjustment…", "keeps a stock adjustment finer than four decimal places", "values initial stock…", "totals a receipt…", "totals the stock value of all raw materials…"); FE:core/decimal.spec.ts. | local-verifiable |

### 2.8 Images

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-70 | MVP | Images | ASSUMPTION: A raw material or product image is optional. The server accepts only JPG, JPEG or PNG: the extension, the declared MIME type (`image/jpeg` or `image/png`) and the file signature (magic bytes) must all agree; otherwise 400 "Invalid image" with a specific message. Source `…/image/ImageValidator.java`. Evidence: IV›acceptsPngByExtensionMimeAndSignature, IV›rejectsRenamedNonImage. Extension-only and MIME-only rejections: PARTIAL. | local-verifiable |
| FR-71 | MVP | Images | ASSUMPTION: The maximum image size is 2 MB (2,097,152 bytes); a larger file gives 400 "The maximum image size is 2 MB". Evidence: IV›rejectsFilesLargerThanTwoMegabytes. | local-verifiable |
| FR-72 | MVP | Images | ASSUMPTION: A multipart request above the Spring limits (`max-file-size` 2MB, `max-request-size` 3MB) gives 413 "File too large" with detail "The maximum image size is 2 MB". Source `application.yml`, `…/common/ApiExceptionHandler.java`. Evidence: GAP. | local-verifiable |
| FR-73 | MVP | Images | ASSUMPTION: The image is stored as a BLOB with its content type and served by `GET /api/raw-materials/{id}/image` and `GET /api/products/{id}/image` with that content type and `Cache-Control: no-store`; 404 "Record not found" when none exists. Evidence: IT›authenticatesAdminAndStoresValidatedPngAsBlob (raw material, bytes and content type round-trip). `no-store`, the product endpoint and the 404: PARTIAL. | local-verifiable |
| FR-74 | MVP | Images | ASSUMPTION: Updating without a new image keeps the stored one; there is no way to remove an image once set. Evidence: GAP; see Open question OQ-11. | local-verifiable |
| FR-75 | MVP | Images | ASSUMPTION: The browser applies the same rules before upload (extension, MIME type, 2 MB) and shows "Select a JPG, JPEG, or PNG file." or "The image size cannot exceed 2 MB." Source `frontend/src/app/core/image-file.ts`. Evidence: GAP (no spec for `image-file.ts`). | local-verifiable |

### 2.9 Product catalog and recipes

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-76 | MVP | Products | ASSUMPTION: `POST /api/products` (multipart) creates a product from `sku` (required, at most 60), `name` (required, at most 120), `description` (at most 1000), `quantity` (whole number, at least 0, at most 12 digits), optional `initialUnitCost`, `advertisingCostPerUnit` (default 0), `markupPercentage` (required) and a `recipe` part. Source `…/inventory/ProductController.java`. Evidence: IT›producesAProductAtomicallyFromItsRawMaterialRecipe; PS›createsProductWithCalculatedSellingPriceAndOpeningMovement. Length limits and fractional-quantity rejection: PARTIAL. | local-verifiable |
| FR-77 | MVP | Products | ASSUMPTION: SKU is unique case-insensitively; a duplicate on create or update gives 409 "A product with SKU “<sku>” already exists." (an update ignores the product itself). Evidence: IT›rejectsDuplicateSkusAndDeletingRecordsThatAreInUse; PS›rejectsDuplicateSkuBeforeValidatingRecipeOrImage. | local-verifiable |
| FR-78 | MVP | Products | ASSUMPTION: `markupPercentage` and `advertisingCostPerUnit` accept at most 2 decimals and must not be negative; a value like 12.345 or 1.239 gives 400 and no product is created. The markup allows at most 6 integer digits (UI maximum 999999.99). Evidence: IT›rejectsProductMarkupOrAdvertisingCostWithMoreThanTwoDecimals; FE:products/products.component.spec.ts "rejects a markup or advertising cost with more than two decimals". | local-verifiable |
| FR-79 | MVP | Products | ASSUMPTION: A product needs a recipe of at least one item; each item has an existing raw material and a quantity per unit greater than 0, and a raw material may appear only once. Violations give 400 (or 404 for an unknown material). Evidence: PARTIAL (FE:products/products.component.spec.ts "requires a recipe, and an initial unit cost when there is opening stock" covers the client; no backend test for empty, duplicate, non-positive or unknown-material recipes). | local-verifiable |
| FR-80 | MVP | Products | ASSUMPTION: An opening product quantity above zero requires an initial unit cost (400 "Initial unit cost is required when initial stock is greater than zero"), rounded to 4 decimals half-up, becomes the product's `averageUnitCost`, and records an `OPENING_BALANCE` movement "Initial product stock" without consuming raw materials. Evidence: PS›createsProductWithCalculatedSellingPriceAndOpeningMovement; IT›producesAProductAtomicallyFromItsRawMaterialRecipe (raw quantities unchanged after create). The missing-cost rejection: PARTIAL (client side only, FE:products/products.component.spec.ts). | local-verifiable |
| FR-81 | MVP | Products | ASSUMPTION: The selling price is never entered. On create and on every update it is computed as (Σ recipe quantity × raw material averageUnitCost + advertisingCostPerUnit) × (1 + markupPercentage / 100), rounded to 2 decimals half-up (so 0.545 gives 0.55), and stored. Evidence: IT›producesAProductAtomicallyFromItsRawMaterialRecipe (225); IT›roundsSellingPricesHalfUpToCentsLikeThePricePreview; PS›createsProductWithCalculatedSellingPriceAndOpeningMovement. | local-verifiable |
| FR-82 | MVP | Products | ASSUMPTION: The product form previews the same selling price, recipe unit cost, and stock values with exact decimal math. Evidence: FE:products/products.component.spec.ts "prices a new product from its recipe, advertising cost and markup", "previews the selling price the server calculates", "estimates the unit cost of a recipe without floating-point drift", "values stock without floating-point drift". | local-verifiable |
| FR-83 | MVP | Products | ASSUMPTION: `PUT /api/products/{id}` updates SKU, name, description, advertising cost, markup, recipe (fully replaced) and optionally the image. It cannot change quantity or average unit cost, and an unknown id gives 404. Evidence: IT›rejectsDuplicateSkusAndDeletingRecordsThatAreInUse (successful update); FE:products/products.component.spec.ts "edits a product without resending its quantity or initial unit cost". The 404: PARTIAL. | local-verifiable |
| FR-84 | MVP | Products | ASSUMPTION: The product list exposes `quantity`, `averageUnitCost`, `stockValue` (quantity × average, 2 decimals), `sellingPrice`, `markupPercentage`, `advertisingCostPerUnit` and the `recipe`. Evidence: IT›producesAProductAtomicallyFromItsRawMaterialRecipe. | local-verifiable |
| FR-85 | MVP | Products | ASSUMPTION: A product that has any sale cannot be deleted (409 "Product “<name>” cannot be deleted because it has been sold."); an unsold product is deleted with 204 and its recipe and movements are removed with it. Evidence: IT›rejectsDuplicateSkusAndDeletingRecordsThatAreInUse; PS›refusesToDeleteProductsThatHaveSales. The cascade: PARTIAL. | local-verifiable |
| FR-86 | MVP | Products | ASSUMPTION: The UI asks "Delete product “<name>”?" via a browser confirm before deleting. Evidence: GAP. | local-verifiable |
| FR-87 | MVP | Products | ASSUMPTION: Creating a product from the UI posts opening stock, initial unit cost and recipe. Evidence: FE:products/products.component.spec.ts "creates a product with its opening stock, initial unit cost and recipe". | local-verifiable |

### 2.10 Production

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-88 | MVP | Production | ASSUMPTION: `POST /api/products/{id}/production` takes `quantity` (whole number greater than 0, at most 12 digits), `productionDate` (required) and optional `notes` (at most 1000). A product with no recipe is rejected with 400 "Add at least one raw material to the product recipe". Evidence: IT›producesAProductAtomicallyFromItsRawMaterialRecipe. The no-recipe rejection: PARTIAL. | local-verifiable |
| FR-89 | MVP | Production | ASSUMPTION: Before changing anything, production multiplies each recipe quantity by the produced quantity and checks every raw material balance; if any is short it returns 409 "Insufficient raw material stock" listing all shortages (for example Ribbon missing 0.6) and no stock changes. Evidence: PS›reportsEveryRawMaterialShortageBeforeStartingProduction; IT›producesAProductAtomicallyFromItsRawMaterialRecipe. | local-verifiable |
| FR-90 | MVP | Production | ASSUMPTION: A successful production, in one transaction, deducts each raw material, records one `PRODUCTION_CONSUMPTION` movement and one `production_consumption` row per material, adds the product units, and records one `PRODUCTION` product movement and one `production_batch`. Evidence: IT›producesAProductAtomicallyFromItsRawMaterialRecipe (3 consumptions, 1 batch, 2 product movements including opening). | local-verifiable |
| FR-91 | MVP | Production | ASSUMPTION: The batch total cost = Σ(required quantity × raw material averageUnitCost at that moment) + advertisingCostPerUnit × produced quantity; the batch unit cost = total / quantity rounded to 4 decimals half-up; the advertising part is stored in `production_batch.advertising_cost`. Evidence: IT›producesAProductAtomicallyFromItsRawMaterialRecipe (total 150, advertising 12); PS›producesStockAndUpdatesWeightedAverageCost. | local-verifiable |
| FR-92 | MVP | Production | ASSUMPTION: After production the product's `averageUnitCost` = (oldQuantity × oldAverage + batch total cost) / newQuantity, rounded to 4 decimals half-up. Example: 2 at 100 plus a batch of 150 gives 116.6667. Evidence: IT›producesAProductAtomicallyFromItsRawMaterialRecipe; PS›producesStockAndUpdatesWeightedAverageCost. | local-verifiable |
| FR-93 | MVP | Production | ASSUMPTION: Production is the only operation that adds produced units; changing a recipe later affects only future production and past batches keep their recorded quantities and costs. Evidence: GAP (no test edits a recipe after a batch). | local-verifiable |
| FR-94 | MVP | Production | ASSUMPTION: The production dialog counts material needs and the production cost with exact decimals, posts the production when materials suffice, and reloads. Evidence: FE:products/products.component.spec.ts "counts production needs without floating-point drift", "posts production when the materials are enough, then reloads", "costs a production run without floating-point drift". | local-verifiable |

### 2.11 Product write-offs and adjustments

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-95 | MVP | Product stock | ASSUMPTION: `POST /api/products/{id}/write-offs` takes a whole `quantity` greater than 0, `operationDate`, `reason` (required, at most 200) and optional `notes`. It reduces the quantity, keeps the average cost, and records a `WRITE_OFF` movement at that average. Evidence: IT›writesOffAndAdjustsRawMaterialAndProductStock (5 down to 3, value 450). | local-verifiable |
| FR-96 | MVP | Product stock | ASSUMPTION: A product write-off larger than the balance gives 409 "Insufficient product stock" and changes nothing. Evidence: IT›writesOffAndAdjustsRawMaterialAndProductStock. | local-verifiable |
| FR-97 | MVP | Product stock | ASSUMPTION: Product write-off and adjustment quantities must be whole numbers; a fractional value gives 400 "<field> must be a whole number". Evidence: PS›rejectsFractionalProductWriteOffsBeforeReadingStock. Fractional adjustment: PARTIAL. | local-verifiable |
| FR-98 | MVP | Product stock | ASSUMPTION: `POST /api/products/{id}/adjustments` sets the quantity to the counted `actualQuantity` (whole, at least 0) and records `ADJUSTMENT_INCREASE` or `ADJUSTMENT_DECREASE` at the current average cost; an increase does not consume raw materials. Evidence: IT›writesOffAndAdjustsRawMaterialAndProductStock (3 up to 6, then 1). The "no raw materials consumed" part: PARTIAL. | local-verifiable |
| FR-99 | MVP | Product stock | ASSUMPTION: A product adjustment equal to the current quantity is rejected with 400 "Actual stock already matches the recorded Product stock". Evidence: GAP. | local-verifiable |
| FR-100 | MVP | Product stock | ASSUMPTION: The Products page blocks a write-off larger than the stock and sends an adjustment as the counted quantity, updating the row in place. Evidence: FE:products/products.component.spec.ts "blocks a write-off larger than the stock", "sends an adjustment as the counted quantity and updates the row in place". | local-verifiable |

### 2.12 Sales

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-101 | MVP | Sales | ASSUMPTION: `POST /api/sales` requires `saleDate`, `paymentMethod` (`CASH`, `CARD` or `BANK_TRANSFER`), optional `notes` (at most 1000) and 1 to 100 items; otherwise 400. Source `…/sales/CreateSaleRequest.java`. Evidence: SS›rejectsIncompleteSaleBeforeAccessingRepositories; IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots. | local-verifiable |
| FR-102 | MVP | Sales | ASSUMPTION: Each sale item needs an existing product (404 otherwise), a whole `quantity` greater than 0 (at most 12 digits), and a `unitPrice` of at least 0 with at most 2 decimals; a product may appear only once per sale. Evidence: PARTIAL (IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots covers the valid case; no test for the duplicate-product, fractional, negative-price or unknown-product rejections). | local-verifiable |
| FR-103 | MVP | Sales | ASSUMPTION: Each sale gets a unique number `SALE-YYYYMMDD-NNNN`, where the date is the sale date and NNNN is the highest existing number for that date plus one, zero-padded to 4 digits. Evidence: PARTIAL (IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots asserts SALE-20260721-0001; incrementing is not asserted). | local-verifiable |
| FR-104 | MVP | Sales | ASSUMPTION: If any item needs more units than the product holds, the whole sale is rejected with 409 "Insufficient product stock" and a `shortages` list (SKU and missing quantity per product); no sale, item or stock change is saved. Evidence: IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots; SS›reportsProductShortageBeforeCreatingSale. | local-verifiable |
| FR-105 | MVP | Sales | ASSUMPTION: A successful sale, in one transaction, deducts each product's stock and records one `SALE` product movement per item valued at the product's average unit cost, with note "Sale <number>". Evidence: IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots. | local-verifiable |
| FR-106 | MVP | Sales | ASSUMPTION: Each sale item stores immutable snapshots: product SKU, product name, recommended unit price (the product's selling price at sale time), actual unit price, and unit cost (the product's average unit cost at sale time). Evidence: IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots (250, 240, 150); SS›createsSaleUsingRoundedFinancialSnapshots. | local-verifiable |
| FR-107 | MVP | Sales | ASSUMPTION: Line revenue = round2(quantity × unit price); line cost = round2(quantity × unit cost); sale totals sum the lines; gross profit = revenue − cost and may be negative. Rounding is half-up to 2 decimals. Evidence: IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots (480, 300, 180); IT›reversesReturnedCostWithHalfUpDivisionLikeTheReturnPreview (line costs 4.35, 0.07, 4.25); SS›createsSaleUsingRoundedFinancialSnapshots. A negative profit: PARTIAL. | local-verifiable |
| FR-108 | MVP | Sales | ASSUMPTION: A new sale has status `COMPLETED`. Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults. | local-verifiable |
| FR-109 | MVP | Sales | ASSUMPTION: `GET /api/sales` lists sales newest first (sale date, then id, descending), each with items and reversal documents; `GET /api/sales/{id}` returns one sale or 404 "Record not found". Evidence: PARTIAL (IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots and IT›reversesTheWholeRecordedCostWhenUnitsAreReturnedOneByOne read them; ordering and the 404 are not asserted). | local-verifiable |
| FR-110 | MVP | Sales | ASSUMPTION: A sale document is never edited or deleted: the API offers only create, read, return and cancel. Evidence: GAP (structural; no test). | local-verifiable |
| FR-111 | MVP | Sales | ASSUMPTION: The sale response carries net values: `refundedRevenue`, `returnedCost`, `netRevenue` = total revenue − refunds, `netCost` = total cost − returned cost, `netGrossProfit` = gross profit − reversed profit. Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults. | local-verifiable |
| FR-112 | MVP | Sales | ASSUMPTION: The New Sale form fills the unit price from the product's selling price, starts at one unit, and does not post a sale needing more units than the stock holds. Posting sends trimmed notes, closes the dialog and reloads. Evidence: FE:sales/sales.component.spec.ts "fills the unit price from the product and starts at one unit", "does not post a sale that needs more units than the stock holds", "posts the sale with trimmed notes, then closes the dialog and reloads". | local-verifiable |
| FR-113 | MVP | Sales | ASSUMPTION: The Sales page computes line prices, sale totals and net totals after returns with exact decimals, and opens the sale named in the `?saleId` query parameter. Evidence: FE:sales/sales.component.spec.ts "loads sales and products and opens the sale named in ?saleId", "totals net revenue, cost and profit after returns", "prices each sale line without floating-point drift", "totals the sale form without floating-point drift", "sums the net totals of all sales without floating-point drift". | local-verifiable |

### 2.13 Returns and cancellations

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-114 | MVP | Returns | ASSUMPTION: `POST /api/sales/{id}/returns` takes `returnDate`, `reason` (required, at most 200), optional `notes` (at most 1000) and a non-empty list of items, each a distinct `saleItemId` of that sale with a whole quantity greater than 0. Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults. Validation rejections (duplicate item, foreign item, blank reason): PARTIAL. | local-verifiable |
| FR-115 | MVP | Returns | ASSUMPTION: A returned quantity may not exceed the item's remaining unreturned quantity; otherwise 400 "Return quantity for <product> exceeds the remaining returnable quantity <n>" and nothing is saved. Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults. | local-verifiable |
| FR-116 | MVP | Returns | ASSUMPTION: A cancelled sale accepts no returns (400 "A cancelled sale cannot receive Product returns") and a fully returned sale accepts none (400 "All Products from this sale have already been returned"). Evidence: GAP. | local-verifiable |
| FR-117 | MVP | Returns | ASSUMPTION: A return or cancellation date earlier than the sale date is rejected (400 "<Return date or Cancellation date> cannot be earlier than the sale date"). Evidence: GAP. | local-verifiable |
| FR-118 | MVP | Returns | ASSUMPTION: Each reversal gets a unique number `RET-YYYYMMDD-NNNN`, built like the sale number but from the reversal date, and stores date, reason, notes, items, refund, returned cost and reversed gross profit. Evidence: PARTIAL (IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults asserts RET-20260802-0001; incrementing is not asserted). | local-verifiable |
| FR-119 | MVP | Returns | ASSUMPTION: The refund for a returned item = round2(returned quantity × the original actual unit price). Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (refund 200 for 1 unit at 200). | local-verifiable |
| FR-120 | MVP | Returns | ASSUMPTION: The returned cost reverses the recorded line cost proportionally: round2(lineCost × (unitsReturnedSoFar + this return) / soldQuantity) minus cost already reversed, never below 0, so returning units one by one reverses exactly the whole recorded line cost (0.33, 0.34, 0.33 for 3 × 0.3333 = 1.00) and half-up rounding applies (2.125 gives 2.13). Evidence: IT›reversesTheWholeRecordedCostWhenUnitsAreReturnedOneByOne; IT›reversesReturnedCostWithHalfUpDivisionLikeTheReturnPreview; FE:sales/sales.component.spec.ts "reverses the recorded line cost in proportion, exactly on the last unit". | local-verifiable |
| FR-121 | MVP | Returns | ASSUMPTION: Returned units go back into product stock, and the product's `averageUnitCost` is re-blended as (currentQuantity × currentAverage + returnedQuantity × recorded sale unit cost) / newQuantity, 4 decimals half-up. Evidence: SS›partiallyReturnsProductsAndRestoresWeightedAverageStockCost (expects 2.6667); IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (average stays 100). | local-verifiable |
| FR-122 | MVP | Returns | ASSUMPTION: Each returned item records a `SALE_RETURN` movement (or `SALE_CANCELLATION` for a cancellation) with note "Return <RET number> for <SALE number>" (or "Cancellation …"). Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (2 return and 1 cancellation movements); SS›partiallyReturnsProductsAndRestoresWeightedAverageStockCost. | local-verifiable |
| FR-123 | MVP | Returns | ASSUMPTION: After a return, the sale status is `RETURNED` when every remaining unit is returned, otherwise `PARTIALLY_RETURNED`. Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults. | local-verifiable |
| FR-124 | MVP | Cancellations | ASSUMPTION: `POST /api/sales/{id}/cancellation` takes `cancellationDate`, `reason` (required, at most 200) and optional `notes`. It reverses every item of a sale whose status is `COMPLETED`, creates a reversal of type `CANCELLATION`, and sets status `CANCELLED`. Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults. | local-verifiable |
| FR-125 | MVP | Cancellations | ASSUMPTION: A sale that is not `COMPLETED` (it has had any return, or is cancelled) cannot be cancelled: 400 "Only a completed sale without previous returns can be cancelled", and nothing is saved. Evidence: SS›refusesToCancelSaleThatAlreadyHasReturns. | local-verifiable |
| FR-126 | MVP | Returns | ASSUMPTION: The Sales page offers returns only for `COMPLETED` and `PARTIALLY_RETURNED` sales and cancellation only for `COMPLETED`; the return dialog lists only items with units left, blocks returning more than remains, and asks for a quantity instead of posting an empty return. Evidence: FE:sales/sales.component.spec.ts "allows returns for completed and partly returned sales, cancellation only for completed", "offers only items with units left and blocks returning more than that", "asks for a quantity instead of posting an empty return", "totals a return without floating-point drift". | local-verifiable |

### 2.14 Stock movement history

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-127 | MVP | Stock history | ASSUMPTION: `GET /api/stock-movements` merges raw material and product movements into one list. Incoming types are, for raw materials, `OPENING_BALANCE`, `RECEIPT`, `ADJUSTMENT_INCREASE`; for products, `OPENING_BALANCE`, `PRODUCTION`, `ADJUSTMENT_INCREASE`, `SALE_RETURN`, `SALE_CANCELLATION`. Everything else is outgoing. Each movement has `signedQuantity` and `signedTotalCost` (negative when outgoing). Source `…/stock/StockMovementRepository.java`. Evidence: IT›listsAndFiltersUnifiedStockMovementHistory (SALE = −1; RECEIPT = +50). The full direction mapping: PARTIAL. | local-verifiable |
| FR-128 | MVP | Stock history | ASSUMPTION: The history filters by `inventoryType` (`ALL` default, `RAW_MATERIAL`, `PRODUCT`), `movementType`, a text `query`, and an inclusive `from`/`to` date range; the filters combine with AND. Evidence: IT›listsAndFiltersUnifiedStockMovementHistory. | local-verifiable |
| FR-129 | MVP | Stock history | ASSUMPTION: The text query matches the item name or product SKU as a case-insensitive substring in any alphabet (for example "троянда" and "ТРОЯНД" find "Троянда"). Evidence: IT›searchesStockHistoryByNameOrSkuIgnoringCaseInAnyAlphabet. | local-verifiable |
| FR-130 | MVP | Stock history | ASSUMPTION: `from` later than `to` gives 400 "From date cannot be later than To date"; a trimmed query longer than 120 characters gives 400 "Search text cannot exceed 120 characters"; a null query is treated as empty. Evidence: IT›listsAndFiltersUnifiedStockMovementHistory; SMS›rejectsFromDateLaterThanToDate, SMS›rejectsSearchTextLongerThan120Characters, SMS›convertsNullSearchTextToAnEmptyString, SMS›trimsSearchTextAndForwardsTheCompleteFilter. | local-verifiable |
| FR-131 | MVP | Stock history | ASSUMPTION: Results are paged: `page` is 0-based (default 0, at least 0), `size` defaults to 25 and must be 1 to 100; the response carries `totalElements`, `totalPages` and the page's movements. Evidence: IT›listsAndFiltersUnifiedStockMovementHistory (size 2, 4 elements, 2 pages). The default of 25 and the bounds: PARTIAL. | local-verifiable |
| FR-132 | MVP | Stock history | ASSUMPTION: Movements are ordered newest first by `occurred_at`, then `created_at`, then inventory type, then movement id, descending. Evidence: PARTIAL (IT›listsAndFiltersUnifiedStockMovementHistory asserts that the newest is first only). | local-verifiable |
| FR-133 | MVP | Stock history | ASSUMPTION: Totals cover the whole filtered result, not just the page: movement count, incoming value, outgoing value and net value change, each in 2 decimals. Evidence: IT›listsAndFiltersUnifiedStockMovementHistory (110, 30, 80); IT›searchesStockHistoryByNameOrSkuIgnoringCaseInAnyAlphabet (empty result gives 0). | local-verifiable |
| FR-134 | MVP | Stock history | ASSUMPTION: Product movements carry a reference: a return or cancellation points to the return number (reference type `SALE_RETURN`, the sale id), a sale to the sale number (`SALE`), and a production to "Batch #<id>" (`PRODUCTION_BATCH`). Evidence: GAP at API level. | local-verifiable |
| FR-135 | MVP | Stock history | ASSUMPTION: The Stock History page loads the first page of all inventory, sends only the filters that are set (trimmed search), restarts at page 0 on a new filter, pages only within the result, ignores paging clicks while loading, resets filters, shows the API error and drops the old result, and links sale and return references to the Sales page. The page size is 25. Evidence: FE:stock-movements/stock-movements.component.spec.ts (all 7 tests). | local-verifiable |

### 2.15 Monthly Sales report

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-136 | MVP | Reports | ASSUMPTION: `GET /api/reports/monthly-sales?month=YYYY-MM` returns the report for that month, with `periodStart` the first day and `periodEnd` the last day of the month. A value that is not `YYYY-MM` gives 400 "Month must use the YYYY-MM format". Evidence: IT›reportsMonthlySalesWithoutMixingOtherMonths; MSR›rejectsInvalidMonthBeforeQueryingRepository; MSR›generatesNetTotalsAverageAndZeroFilledPaymentMethods. | local-verifiable |
| FR-137 | MVP | Reports | ASSUMPTION: Sales are included by their sale date; returns and cancellations by their own reversal date (not the original sale's month). Sales of other months are excluded. Evidence: IT›reportsMonthlySalesWithoutMixingOtherMonths; IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (August shows 0 sales, 3 reversals). | local-verifiable |
| FR-138 | MVP | Reports | ASSUMPTION: `salesCount` counts sale documents of the month and `returnCount` counts reversal documents of the month. Evidence: IT›reportsMonthlySalesWithoutMixingOtherMonths (2); IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (0 and 3). | local-verifiable |
| FR-139 | MVP | Reports | ASSUMPTION: `unitsSold` in the report is net units (sold minus returned in the month, so it can be negative) and `unitsReturned` is the returned units. Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (−6 and 6); MSR›generatesNetTotalsAverageAndZeroFilledPaymentMethods (8 − 2 = 6). | local-verifiable |
| FR-140 | MVP | Reports | ASSUMPTION: `grossRevenue` is the sum of the month's sales, `refunds` is the sum of the month's refunds, `revenue` = gross revenue − refunds, `totalCost` = sale cost − returned cost, `returnedCost` is the reversed cost, and `grossProfit` = `revenue` − `totalCost` (net values; can be negative). Evidence: IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (revenue −1200, cost −600, profit −600); MSR›generatesNetTotalsAverageAndZeroFilledPaymentMethods. | local-verifiable |
| FR-141 | MVP | Reports | ASSUMPTION: `averageSaleValue` = gross revenue / number of sale documents, 2 decimals half-up, and 0.00 when there are no sales. Evidence: IT›reportsMonthlySalesWithoutMixingOtherMonths (365); MSR›generatesNetTotalsAverageAndZeroFilledPaymentMethods (33.33). The no-sales case: PARTIAL. | local-verifiable |
| FR-142 | MVP | Reports | ASSUMPTION: `paymentSummaries` always has three entries in the order CASH, CARD, BANK_TRANSFER, with zero values for unused methods; each combines the month's sales and reversals for that payment method. Evidence: IT›reportsMonthlySalesWithoutMixingOtherMonths; MSR›generatesNetTotalsAverageAndZeroFilledPaymentMethods. | local-verifiable |
| FR-143 | MVP | Reports | ASSUMPTION: `dailySummaries` combines sales and reversals on the dates they were recorded, ordered by date; `productSummaries` combines them per product, ordered by net revenue descending then product name; `sales` and `returns` list the month's documents. Evidence: IT›reportsMonthlySalesWithoutMixingOtherMonths (2 days, product quantity 3, profit 280, 2 sales); IT›returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults (3 returns). Ordering: PARTIAL. | local-verifiable |
| FR-144 | MVP | Reports | ASSUMPTION: The report page loads the current month on open, reloads when another month is picked, ignores a cleared month picker, and shows the API error while dropping the previous report. Evidence: FE:reports/monthly-sales/monthly-sales-report.component.spec.ts "loads the current month on open", "reloads for another month and ignores a cleared month picker", "shows the API error and drops the previous report". | local-verifiable |
| FR-145 | MVP | Reports | ASSUMPTION: Export CSV downloads `monthly-sales-<YYYY-MM>.csv` as UTF-8 with a byte order mark and CRLF line breaks, every cell quoted with embedded quotes doubled, in three blocks (sales, returns and cancellations, monthly net totals); nothing is exported for a month with no sales and no returns. Amount headers say "(UAH)". Evidence: FE:reports/monthly-sales/monthly-sales-report.component.spec.ts "exports sales and returns as a UTF-8 CSV with escaped quotes", "does not export a month without sales or returns". | local-verifiable |
| FR-146 | MVP | Reports | ASSUMPTION: A sale number in the report links to the full document on the Sales page. Evidence: GAP (no spec asserts the link). | local-verifiable |

### 2.16 Data model and migration

| ID | Phase | Area | Description | Verification |
|---|---|---|---|---|
| FR-147 | MVP | Data | ASSUMPTION: On every start an idempotent migration upgrades existing databases (adds missing columns `average_unit_cost`, `reorder_level`, `markup_percentage`, `advertising_cost_per_unit`, `advertising_cost`, `status`, `sale_id`, `sale_return_id`; widens the movement-type CHECK lists) and can be run twice safely. Source `…/config/InventorySchemaMigration.java`. Evidence: ISM›migratesAnExistingRawMaterialTableAndIsIdempotent. | local-verifiable |
| FR-148 | MVP | Data | ASSUMPTION: The migration creates one `OPENING_BALANCE` movement (cost 0, note "Opening balance migrated from the existing inventory") for each raw material or product that has stock and no movement yet. Evidence: ISM›migratesAnExistingRawMaterialTableAndIsIdempotent (raw material and product movements counted). | local-verifiable |
| FR-149 | MVP | Data | ASSUMPTION: Database rules enforce non-negative quantities and costs, unique SKU, sale number and return number, restricted deletes of referenced rows (recipe materials, sold products, sale documents) and foreign keys on. Evidence: PARTIAL (IT›rejectsDuplicateSkusAndDeletingRecordsThatAreInUse asserts the duplicate SKU constraint; the other CHECK and FK rules are not asserted directly). | local-verifiable |

## 3 Non-Functional Requirements (NFR)

Verification tags follow the template. `deploy-gated` is used only where a live URL would be needed; this product is
local, so nothing is deploy-gated today (see OQ-9 and OQ-10 for budgets and availability that are not declared).

| ID | Category | Description | Verification |
|---|---|---|---|
| NFR-1 | Security | ASSUMPTION: Password policy for a changed password is length 10 to 64 and different from the current password. No complexity classes, no reuse history, no breach check. The bootstrap password (`APP_ADMIN_INITIAL_PASSWORD`) is not checked against the policy. Evidence: PARTIAL (IT›changesTheAuthenticatedAdminPasswordAndEndsAllSessions covers length; the difference rule and the bootstrap password are not asserted). | local-verifiable |
| NFR-2 | Security | ASSUMPTION: Passwords are stored only as bcrypt hashes with cost factor 12 (`BCryptPasswordEncoder(12)`), never in plain text; the repo holds no default password. Evidence: PARTIAL (LAI asserts the encoder is used, with a mock; the cost factor is not asserted). | local-verifiable |
| NFR-3 | Security | ASSUMPTION: Session inactivity timeout is 8 hours (`server.servlet.session.timeout: 8h`), enforced by the server and mirrored in the browser from the `X-Session-Timeout-Seconds` header. Evidence: PARTIAL (IT›reportsTheActualSessionTimeoutWithoutCreatingAnonymousSessions proves the header follows the session's interval; no test pins the 8h value). | local-verifiable |
| NFR-4 | Security | ASSUMPTION: Session cookie is `HttpOnly` and `SameSite=Strict`; the `Secure` flag is not set (the app is served over plain HTTP on localhost; see OQ-13). Evidence: GAP. | local-verifiable |
| NFR-5 | Security | ASSUMPTION: CSRF protection uses a cookie token (`XSRF-TOKEN`, readable by the SPA) and header `X-XSRF-TOKEN` on all state-changing requests. Evidence: PARTIAL (positive path in every write test; see FR-6). | local-verifiable |
| NFR-6 | Security | ASSUMPTION: Every response sets a Content-Security-Policy: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'`. Evidence: GAP. | local-verifiable |
| NFR-7 | Security | ASSUMPTION: A new session identifier is issued at login (session fixation protection), and a password change expires all sessions of the user. Evidence: PARTIAL (IT›changesTheAuthenticatedAdminPasswordAndEndsAllSessions covers the expiry; the identifier change is not asserted). | local-verifiable |
| NFR-8 | Security | ASSUMPTION: Passwords are masked in request logging: `toString()` of the login and change-password requests prints `[PROTECTED]`. Evidence: IT›masksPasswordsInAuthenticationRequestLogs. | local-verifiable |
| NFR-9 | Security | ASSUMPTION: Error responses do not expose stack traces or raw framework messages (`server.error.include-message: never`, `include-stacktrace: never`); controller errors use problem details (title and detail), while filter-level 401 and 403 use a small `{"message": …}` JSON. Evidence: PARTIAL (IT asserts `title` and `detail` for domain errors; the config switches are not asserted). | local-verifiable |
| NFR-10 | Security | ASSUMPTION: No login throttling, account lockout or multi-factor sign-in exists. There are no emailed or expiring links (no password reset, no invitations), so there is no link-expiry requirement. Evidence: GAP (an absence; see OQ-6). | local-verifiable |
| NFR-11 | Security | ASSUMPTION: Authorization has a single role, `ADMIN` (the schema CHECK allows no other role); concurrent sessions per user are unlimited. Evidence: GAP. | local-verifiable |
| NFR-12 | Data integrity | ASSUMPTION: Each business operation that touches several tables (create with opening movement, receipt, production, sale, return, cancellation, write-off, adjustment) runs in one database transaction, so a rejected operation changes nothing. Evidence: IT›sellsProductsAtomicallyAndKeepsFinancialSnapshots and IT›producesAProductAtomicallyFromItsRawMaterialRecipe (rejection leaves counts and quantities unchanged). | local-verifiable |
| NFR-13 | Data integrity | ASSUMPTION: Stock deduction is a check-and-set against the value that was read, so concurrent writers cannot drive stock negative; the connection pool size is 1. Evidence: GAP. | local-verifiable |
| NFR-14 | Data integrity | ASSUMPTION: Money and quantity values are exact decimals. Money is 2 decimals half-up, unit costs 4 decimals half-up, and values read from SQLite are normalized to 15 significant digits. The frontend uses `core/decimal.ts` and must match the server's rounding. Evidence: SDT; IT›roundsSellingPricesHalfUpToCentsLikeThePricePreview; IT›reversesReturnedCostWithHalfUpDivisionLikeTheReturnPreview; FE:core/decimal.spec.ts. | local-verifiable |
| NFR-15 | Performance | ASSUMPTION: No load, screen, or calculation budget is declared or tested. Observed shape: the raw material, product and sales lists and the report documents are returned unpaginated (only Stock History is paged), and the sale list loads items and reversals for each sale. Evidence: GAP; see OQ-9. | local-verifiable |
| NFR-16 | Availability | ASSUMPTION: No availability target exists. The system is a single local process started by the owner; `Start OnlineStore.cmd` waits for `GET /api/health` before opening the browser. There is no backup, restore or export of the SQLite file in the application. Evidence: PARTIAL (IT›reportsHealthWithoutSigningInOrCreatingASession covers health only); see OQ-10. | local-verifiable |
| NFR-17 | Compatibility | ASSUMPTION: No supported browser list is declared (there is no browserslist; Angular 22 defaults apply). Evidence: none; see OQ-8. | e2e |
| NFR-18 | Compatibility | ASSUMPTION: The layout is responsive: CSS breakpoints exist at 480, 575.98, 620, 767.98, 820, 980 and 1100 px, and the shell has a toggled mobile menu (FR-35). No target device list is declared. Evidence: FE:layout/shell.component.spec.ts covers the menu toggle only; the layout itself is unverified. | vision-verify |
| NFR-19 | Usability | ASSUMPTION: Destructive deletes ask for confirmation; API errors are shown in the UI through `apiErrorMessage`; forms validate before sending (required fields, maximum lengths, minimums, decimal patterns). Evidence: PARTIAL (FE specs of the pages, see FR-69, FR-82, FR-94, FR-112, FR-126; the delete confirmations are not asserted). | local-verifiable |
| NFR-20 | Usability | ASSUMPTION: Accessibility: the templates carry ARIA attributes and labels, but no accessibility target or automated gate exists. Evidence: none; see OQ-15. | a11y |
| NFR-21 | Localization | ASSUMPTION: The UI, messages and code are English only (`<html lang="en">`); there is no translation framework. Amounts are shown as UAH with 2 decimals (`currency:'UAH':'symbol-narrow'`); dates are ISO `YYYY-MM-DD`. Searching and stored names work in any alphabet. Evidence: PARTIAL (IT›searchesStockHistoryByNameOrSkuIgnoringCaseInAnyAlphabet covers the alphabet part; the currency formatting is not asserted). | local-verifiable |
| NFR-22 | Localization | ASSUMPTION: Stored amounts carry no currency code; UAH is a display assumption of the local profile (README). Evidence: GAP; see OQ-14. | local-verifiable |

## 4 Constraints

### 4.1 Technical Constraints

| ID | Description |
|---|---|
| TC-1 | ASSUMPTION: Backend is Java 21 with Spring Boot 4.1.1 (starters: web, security, jdbc, validation); feature packages under `com.flowershop.inventory.<feature>`; DTOs and requests are Java records. Source: `docs/adr/0001-adopt-existing-stack.md`, `AGENTS.md`. |
| TC-2 | ASSUMPTION: Persistence is SQLite through plain SQL with `JdbcTemplate` (no JPA). NUMERIC columns are read with `SqliteDecimals.read`. The pool size is 1 and `PRAGMA foreign_keys = ON`. A schema change goes to `schema.sql` and to an idempotent step in `InventorySchemaMigration` with a test. |
| TC-3 | ASSUMPTION: Frontend is Angular 22 with Bootstrap 5, TypeScript, Vitest, pnpm (never npm or yarn) and a pinned Node v24.15; Prettier at 100 columns with single quotes; `HttpClient` keeps `withXhr()`; money and quantity math only through `core/decimal.ts`. |
| TC-4 | ASSUMPTION: The product ships as one executable JAR containing the Angular production build. Local profile `local` is the default: port 8081, database file `flower-shop-local.db` in the project root, administrator bootstrap through `APP_ADMIN_INITIAL_USERNAME` and `APP_ADMIN_INITIAL_PASSWORD`. The admin bootstrap runs only in profile `local`. |
| TC-5 | ASSUMPTION: The API is JSON over `/api/**` (multipart for raw material and product create/update); controller errors are problem details. A new Angular route also needs its path in `SpaController` and a forwarding test. |
| TC-6 | Out of scope, from the approved spec: automatic reordering, supplier notifications, purchase orders, and a reorder level for finished products. |
| TC-7 | ASSUMPTION: Not present in the code and therefore outside the baseline: customers, suppliers, taxes or VAT, discounts, multiple currencies, multiple users or roles other than `ADMIN`, password reset by email, imports of any kind, image formats other than JPG, JPEG and PNG, and any export other than the Monthly Sales CSV. |
| TC-8 | ASSUMPTION: The unit-of-measure list is fixed in code to PIECE, BUNCH, GRAM, KILOGRAM, METER, PACKAGE. Product quantities are whole units; raw material quantities may be decimal. |
| TC-9 | ASSUMPTION: Tests run against an in-memory SQLite database (`src/test/resources/application-test.yml`); the build command is `mvn -B -ntp verify`, which also builds the frontend. |

### 4.2 Business Constraints

| ID | Description |
|---|---|
| BC-1 | Phasing: every row in this document is MVP because it is shipped. No Future Phase is declared; anything new needs a human decision. |
| BC-2 | Change control (from `AGENTS.md`): a feature that changes schema, API and page together starts with an approved `docs/specs/<feature>.md` whose acceptance criteria name their tests; `scripts/check-specs.mjs` fails the build when a spec and its tests drift. Changes after approval are recorded under "Changed after approval". |
| BC-3 | Autonomy (from `AGENTS.md`): the agent proposes first and waits for a human decision before changing more than one file; it asks before adding a dependency or editing `pom.xml`, `frontend/package.json`, `application*.yml`, `SecurityConfig`, `auth/`, CI workflows, `.claude/settings.json` or `.mcp.json`. |
| BC-4 | Discovery: this baseline was reverse-engineered on 2026-10-11 (ADR-0001) and ratified as written by volodya4u in chat on the same day, with the recommended defaults for all open questions. Rows keep their ASSUMPTION marker as a record of how they were derived; ratification means they are now the source of truth. |
| BC-5 | ASSUMPTION: The business is one shop with one administrator on a single machine; "local" is a business constraint (README: "A local inventory system"), not only a technical one. |
| BC-6 | ASSUMPTION: Completed sales are retained permanently and reversed only by separate audited documents; catalog edits or deletions never rewrite completed sale values (README). |

## 5 Assumptions & Notes for Estimation

- Every FR, NFR, TC and BC row is an ASSUMPTION inferred from code, tests, README, `AGENTS.md`, ADR-0001 and the one approved
  spec. The human ratifies the baseline. Nothing here proposes a code change.
- Inference confidence per area (the baseline sign-off should look hardest where it is low):

| Area | Confidence | Why |
|---|---|---|
| Authentication, password change, bootstrap (FR-1 to FR-22) | High | Read in full, with integration and unit tests; gaps are 403 body, disabled user, CSRF negative |
| Session lifetime (FR-23 to FR-32) | High | Explicit README text and 16 interceptor tests |
| Routing and shell (FR-33 to FR-36) | Medium | Only two of nine forwarded routes are tested; route table read by hand |
| Dashboard (FR-37 to FR-41) | High | Short code; the cancelled-exclusion is code-only |
| Raw materials, receipts, write-offs, adjustments (FR-42 to FR-69) | High | Code plus services plus integration tests |
| Reorder level (FR-57 to FR-60) | High | Approved spec that matches the code |
| Images (FR-70 to FR-75) | Medium | Validator read in full; only 3 unit tests; the product endpoint and the client check are untested |
| Products and production (FR-76 to FR-100) | High for math; Medium for validation | Formulas read and tested; validation branches mostly untested |
| Sales and returns (FR-101 to FR-126) | High for money rules; Medium for status rules | Money paths are well tested; guard branches are not |
| Stock history (FR-127 to FR-135) | High | One integration flow plus unit and page tests |
| Monthly report (FR-136 to FR-146) | High | Integration, unit and page tests; SQL read in full for the summaries except `findSales` and `findReturns` |
| Data model and migration (FR-147 to FR-149) | Medium | One broad migration test; CHECK and FK rules read from schema only |
| NFRs (NFR-1 to NFR-22) | Medium | Config read directly; most security settings have no test; performance, availability, browsers and accessibility are unknown |

- Inferred, not stated anywhere: "single administrator" as a business constraint (BC-5); that `RETURNED` sales count in
  the dashboard sales count on purpose (OQ-2); that the stored selling price (OQ-1) is intended.
- `README.md` says "Selling Price ... is recalculated while recipe materials, recipe quantities, advertising cost, or
  Product markup are changed". The code recalculates and stores it only when the product is saved (FR-81). The README
  and the code agree for the form preview; they differ in what happens after a raw material's average cost changes. See OQ-1.
- Dates: opening balances use the server's `LocalDate.now()`, while forms default to the browser's local date. They
  agree when the browser and server share a time zone, as in the local profile.
- Raw material and product movement history carries no "performed by" field; with one user this loses nothing today.
- MVP scope summary: sign-in and password change, session timeout, raw material and product catalogs with images, receipts,
  weighted-average cost, recipes, atomic production, sales with snapshots, returns and cancellations, write-offs and
  adjustments, reorder level and low stock, unified stock history, monthly sales report with CSV export. Future Phase: none declared.

## Open questions

Each has a recommended default; answering "use defaults" ratifies all of them.

| ID | Question | Recommended default |
|---|---|---|
| OQ-1 | The product's selling price is stored at save time (FR-81). When a receipt later changes a raw material's average cost, the stored price and the "recommended price" on new sales stay at the old value until the product is saved again. Is that intended? | Ratify as is: price is fixed at the last product save, and the baseline records it. |
| OQ-2 | The dashboard sales count includes `RETURNED` and `PARTIALLY_RETURNED` sales and excludes only `CANCELLED` ones (FR-38). Is that the intended meaning of "Sales"? | Ratify as is. |
| OQ-3 | Raw material names are not unique (products have a unique SKU, raw materials only a name). Should duplicate names be allowed? | Ratify as is (allowed). |
| OQ-4 | No rule limits dates: sales, receipts, write-offs, returns may be back-dated or future-dated (only "return not before sale date" exists). Is that intended? | Ratify as is; time zone is the server's. |
| OQ-5 | Deleting an unsold product or an unused raw material also deletes its movement history (`ON DELETE CASCADE`), even though movements are described as audited. Is losing that history on delete intended? | Ratify as is. |
| OQ-6 | There is no login throttling or lockout. Is that acceptable for a localhost, single-user tool? | Yes, out of scope while the app stays local-only. |
| OQ-7 | Password policy is length 10 to 64 only, and the bootstrap password is not checked. Confirm. | Ratify as is. |
| OQ-8 | Which browsers must be supported? None is declared. | Current evergreen Chrome, Edge, Firefox and Safari on desktop, plus current Chrome and Safari on tablet and phone (layout works from 320 px). |
| OQ-9 | What are the performance budgets? None is declared; lists other than Stock History are unpaginated. | Screens interactive within 2 s and write operations within 1 s on the owner's machine for up to 5,000 raw materials and products and 20,000 sales; Stock History page within 1 s. |
| OQ-10 | What availability and backup expectation applies? There is no backup of the SQLite file in the app. | Best-effort local use, no uptime target; the owner copies `flower-shop-local.db` for backup. |
| OQ-11 | Images cannot be removed once set, only replaced (FR-74). Intended? | Ratify as is. |
| OQ-12 | Product write-offs and adjustments accept whole units only, while raw materials allow decimals (FR-97, FR-68). Confirm this split. | Ratify as is. |
| OQ-13 | Should the `Secure` cookie flag and HTTPS be required if the app is ever exposed beyond localhost (NFR-4)? | Out of scope: the baseline is local, HTTP only. Revisit before any remote deployment. |
| OQ-14 | Currency is a display assumption (UAH) and not stored. Is UAH-only acceptable? | Yes, UAH only. |
| OQ-15 | What accessibility target applies (for example WCAG 2.2 AA)? None is declared. | WCAG 2.1 AA as an aspiration, with no gate until the owner confirms. |
| OQ-16 | A return re-blends the product's average cost with the recorded sale cost (FR-121), so the average can drift after returns. The README says restored inventory "uses the weighted-average Product cost recorded at the time of that sale". Confirm both describe the same intent. | Yes: units come back at the recorded sale cost and the product average is re-blended. |

## Coverage gaps

Candidate work: behaviors this baseline records that no existing test asserts (GAP) or asserts only in part (PARTIAL).
Each is tagged `local-verifiable`, so a test should be written before the baseline is trusted. Test names are not
invented here; this lists what is missing. Total: 71 requirements (29 GAP, 42 PARTIAL).

| Requirement | Type | What is missing |
|---|---|---|
| `FR-2` | GAP | Username matches case-insensitively |
| `FR-3` | PARTIAL | Message text "Invalid username or password"; disabled user |
| `FR-4` | PARTIAL | 403 "Access denied" path; JSON body of the 401 |
| `FR-6` | GAP | State-changing request without CSRF token is rejected |
| `FR-8` | GAP | Backend logout returns 204 and invalidates the session |
| `FR-12` | PARTIAL | Server-side rejection of a mismatched confirmation |
| `FR-13` | GAP | New password equal to the current one is rejected |
| `FR-33` | PARTIAL | Seven of nine SPA routes are not covered by a forwarding test |
| `FR-34` | GAP | Route table, guard coverage and default redirects |
| `FR-37` | GAP | Raw material count, product count, product units |
| `FR-38` | PARTIAL | Cancelled sales are excluded from the sales count |
| `FR-42` | PARTIAL | Name and description length limits; negative quantity rejection |
| `FR-43` | PARTIAL | Unsupported unit gives 400 |
| `FR-46` | PARTIAL | No opening movement when quantity is 0 |
| `FR-48` | GAP | List is ordered by name, case-insensitive |
| `FR-49` | PARTIAL | Update of an unknown raw material gives 404 |
| `FR-54` | PARTIAL | Movements are removed with the deleted raw material |
| `FR-55` | GAP | Delete confirmation in the UI |
| `FR-56` | GAP | Duplicate raw material names are accepted |
| `FR-60` | GAP | Reorder level changes no stock or valuation |
| `FR-61` | PARTIAL | Receipt validation rejections (quantity, cost, date, notes length) |
| `FR-67` | GAP | Raw material adjustment equal to current quantity is rejected |
| `FR-70` | PARTIAL | Extension-only and MIME-only rejections |
| `FR-72` | GAP | Oversized multipart request gives 413 |
| `FR-73` | PARTIAL | `no-store`, the product image endpoint, the 404 |
| `FR-74` | GAP | Update without image keeps the stored image |
| `FR-75` | GAP | Client-side image check (`core/image-file.ts`) has no spec |
| `FR-76` | PARTIAL | Product field length limits; fractional quantity rejection |
| `FR-79` | PARTIAL | Backend recipe validation (empty, duplicate, non-positive, unknown material) |
| `FR-80` | PARTIAL | Server-side rejection of a missing initial unit cost for positive opening stock |
| `FR-83` | PARTIAL | Update of an unknown product gives 404 |
| `FR-85` | PARTIAL | Recipe and movements removed with a deleted product |
| `FR-86` | GAP | Delete confirmation in the UI |
| `FR-88` | PARTIAL | Production of a product with no recipe is rejected |
| `FR-93` | GAP | A recipe edit does not change past batches |
| `FR-97` | PARTIAL | Fractional product adjustment is rejected |
| `FR-98` | PARTIAL | Product adjustment consumes no raw material |
| `FR-99` | GAP | Product adjustment equal to current quantity is rejected |
| `FR-102` | PARTIAL | Duplicate product, fractional quantity, negative price, unknown product in a sale |
| `FR-103` | PARTIAL | Sale number increments within a date |
| `FR-107` | PARTIAL | Negative gross profit |
| `FR-109` | PARTIAL | Sale list ordering; 404 for unknown sale |
| `FR-110` | GAP | Sale documents are immutable (no update or delete) |
| `FR-114` | PARTIAL | Return validation (duplicate item, item of another sale, blank reason) |
| `FR-116` | GAP | Return on a cancelled or fully returned sale is rejected |
| `FR-117` | GAP | Reversal date before the sale date is rejected |
| `FR-118` | PARTIAL | Reversal number increments within a date |
| `FR-127` | PARTIAL | Direction mapping for every movement type |
| `FR-131` | PARTIAL | Default page size 25 and the size bounds |
| `FR-132` | PARTIAL | Full ordering of equal-date movements |
| `FR-134` | GAP | Movement reference fields at the API level |
| `FR-141` | PARTIAL | Average sale value is 0.00 when there are no sales |
| `FR-143` | PARTIAL | Ordering of daily and product summaries |
| `FR-146` | GAP | Sale number link in the report |
| `FR-149` | PARTIAL | CHECK and foreign-key rules other than the duplicate SKU |
| `NFR-1` | PARTIAL | Difference rule and bootstrap password check |
| `NFR-2` | PARTIAL | bcrypt cost factor 12 |
| `NFR-3` | PARTIAL | The 8h value is not pinned by a test |
| `NFR-4` | GAP | Cookie flags HttpOnly and SameSite=Strict |
| `NFR-5` | PARTIAL | Negative CSRF path |
| `NFR-6` | GAP | Content-Security-Policy header |
| `NFR-7` | PARTIAL | New session id at login |
| `NFR-9` | PARTIAL | Error config switches (no message or stack trace leakage) |
| `NFR-10` | GAP | No throttling or lockout (an absence; a guard test would pin it) |
| `NFR-11` | GAP | Single role and unlimited concurrent sessions |
| `NFR-13` | GAP | Concurrent deduction cannot go negative |
| `NFR-15` | GAP | No performance test exists |
| `NFR-16` | PARTIAL | Only health is tested; no availability or backup behavior |
| `NFR-19` | PARTIAL | Delete confirmations |
| `NFR-21` | PARTIAL | UAH display formatting |
| `NFR-22` | GAP | Currency is display-only; nothing asserts it |

Rows with a non-`local-verifiable` tag and no automated mechanism (NFR-17 `e2e`, NFR-18 `vision-verify`, NFR-20 `a11y`)
are not counted above. They will fail the acceptance-method gate at G3 until a mechanism exists or the owner answers
OQ-8 and OQ-15 and the tag is changed.
