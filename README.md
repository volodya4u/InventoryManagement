# Flower Shop Inventory

A local inventory system for tracking raw materials and finished products for a flower shop.

## Current Features

- Secure session-based sign-in for a single administrator.
- The password is stored in SQLite as a one-way bcrypt hash.
- Raw material and finished product catalogs.
- Create, edit, and delete operations.
- Raw-material receipts and weighted-average inventory valuation.
- Product recipes, atomic production, and raw-material consumption.
- Sales with automatic Product stock deduction, returns, cancellations, and immutable financial snapshots.
- Raw Material and Product write-offs and physical-count stock adjustments with audited movements.
- Monthly Sales report with revenue, cost, gross profit, payment, daily, and Product breakdowns.
- JPG, JPEG, and PNG images stored as BLOBs.
- Image validation in both the browser and the server.
- Maximum image size of 2 MB.
- The Angular production build is automatically included in the executable Spring Boot JAR.

## Inventory Concepts

- **Raw Material**: an item consumed when making a finished product, such as a flower, ribbon, moss, packaging, or a decorative element.
- **Product**: a finished item that can be stored and sold.
- **Initial Stock**: the quantity already available when a raw material is first added to the system.
- **Initial Unit Cost**: the purchase cost of one unit of the initial stock. It is required when the initial stock is greater than zero and is optional when the initial stock is zero.
- **Initial Stock Value**: the initial quantity multiplied by the initial unit cost. The frontend calculates this value automatically.
- **Average Unit Cost**: the weighted-average cost of one unit based on the current stock and all subsequent receipts.
- **Stock Value**: the current quantity multiplied by the average unit cost.
- **Receive Stock**: the operation used to record a new raw-material delivery. Enter the received quantity, unit purchase cost, receipt date, and optional notes. Stock quantities should not be changed through the regular edit form.

### Unit of Measurement

The selected unit defines what the raw-material quantity and unit cost represent.

| Unit | Meaning | Example |
| --- | --- | --- |
| **Piece** | One individual flower or another separate item | 25 roses or 10 decorative elements |
| **Bunch** | One prepared bunch of material | 4 bunches of eucalyptus |
| **Gram** | Weight measured in grams | 150 g of moss or decorative filler |
| **Kilogram** | Weight measured in kilograms | 2.5 kg of sand or decorative stones |
| **Meter** | Length measured in meters | 12.5 m of ribbon or wrapping material |
| **Package** | One unopened package | 3 packages of floral wire |

Choose the smallest practical unit in which the material is consumed. For example, if roses are purchased in bunches but used one by one, select **Piece** and convert the delivery quantity into individual flowers. If ribbon is purchased in rolls but consumed by length, select **Meter**.

### Weighted-Average Cost

When new stock is received at a different price, the system recalculates the average unit cost:

```text
Current stock: 10 × UAH 20 = UAH 200
New receipt:    5 × UAH 26 = UAH 130

New average unit cost = (UAH 200 + UAH 130) / 15 = UAH 22
```

All monetary values in the current local profile are displayed in Ukrainian hryvnia (UAH).

### Product Recipes and Production

Every finished product has a recipe that defines the raw materials required for one product unit. A recipe item contains a raw material and its required quantity, such as `5 Piece Rose` or `0.8 Meter Ribbon`.

- **Initial Product Stock** represents finished products that existed before inventory tracking started. It does not consume raw materials.
- **Initial Unit Cost** values the initial finished-product stock and is required when the initial stock is greater than zero.
- **Markup, %** is configured separately for every product and represents the percentage added to the current recipe cost.
- **Recommended Selling Price** is calculated automatically as `recipe unit cost × (1 + markup / 100)`. It is recalculated while recipe materials, recipe quantities, or the product markup are changed and cannot be entered manually.
- **Produce** is the only operation that adds subsequent product units. Direct stock editing is not allowed.
- Before production, the application multiplies every recipe quantity by the requested production quantity and checks all raw-material balances.
- If any material is insufficient, the entire operation is rejected and no stock is changed.
- Successful production deducts every required raw material, adds the finished products, and records the production batch and all stock movements in one database transaction.
- Production cost is calculated from the current weighted-average costs of the consumed raw materials. The product's weighted-average unit cost is then recalculated. This cost is separate from the product's selling price.

Editing a recipe affects only future production. Previous production batches keep the quantities and costs that were recorded when they were completed.

### Write-Offs and Stock Adjustments

Both **Raw Materials** and **Products** provide dedicated **Write Off** and **Adjust Stock** actions. Regular catalog editing cannot change stock quantities.

- **Write Off** reduces the available quantity for damaged, spoiled, lost, rejected, or otherwise unusable stock. The operation is rejected when the requested quantity exceeds the current balance.
- **Adjust Stock** sets the balance to the quantity physically counted during inventory. The system records the difference as either `ADJUSTMENT_INCREASE` or `ADJUSTMENT_DECREASE`.
- Every operation stores its date, reason, optional notes, quantity difference, current average unit cost, and the resulting value change in the stock-movement history.
- A write-off or downward adjustment keeps the existing average unit cost and reduces Stock Value proportionally.
- An upward adjustment values the discovered units at the existing average unit cost. Increasing Product stock through an adjustment does not consume Raw Materials because it corrects an existing balance rather than recording new production.
- Product write-offs and adjustments accept only whole units. Raw Material quantities may use decimals according to their unit of measurement.

### Sales

A sale can contain one or more finished Products. The current recommended selling price is filled in automatically, but the administrator can enter the actual price charged to the customer.

- Every sale receives a unique number such as `SALE-20260721-0001`.
- Supported payment methods are **Cash**, **Card**, and **Bank Transfer**.
- Only positive whole Product quantities can be sold.
- Before saving, the application checks every Product balance. If any Product is insufficient, the entire sale is rejected and no stock is changed.
- A successful sale deducts Product stock and records a `SALE` stock movement in one database transaction.
- Every sale item stores snapshots of the Product SKU, name, recommended price, actual price, and weighted-average unit cost.
- **Revenue** is the actual unit price multiplied by quantity.
- **Cost** is the Product's weighted-average unit cost at the time of sale multiplied by quantity.
- **Gross Profit** is revenue minus cost and can be negative when the actual price is below cost.

Changing or deleting catalog data later does not rewrite completed sale values. A completed sale is retained permanently and can be reversed through a separate audited document:

- **Return Products** accepts a partial or full quantity from a completed or partially returned sale. A quantity can never exceed the remaining unreturned quantity.
- **Cancel Sale** reverses every item in a completed sale. It is available only before any Product has already been returned.
- Every reversal receives a unique number such as `RET-20260721-0001` and stores its date, reason, notes, items, refund, returned cost, and reversed gross profit.
- The refund uses the actual unit price recorded in the original sale. Restored inventory uses the weighted-average Product cost recorded at the time of that sale.
- Returned Products are added back to Product stock and recorded as `SALE_RETURN` or `SALE_CANCELLATION` stock movements.
- Sale status changes from **Completed** to **Partially Returned**, **Returned**, or **Cancelled**. Original sale values and reversal history remain available for audit.

### Monthly Sales Report

Open **Reports -> Monthly Sales** and select a report month. Sales are included by their sale date, while returns and cancellations are included by their own reversal date.

- **Sales** is the number of sale documents created during the month; **Returns / Cancellations** is the number of reversal documents created during the month.
- **Net Units** is sold quantity minus returned quantity for the selected month.
- **Gross Revenue** is recorded sales before refunds. **Net Revenue** is Gross Revenue minus refunds.
- **Net Cost** and **Net Gross Profit** subtract the cost and profit reversed by returns or cancellations.
- **Average Sale** is monthly Gross Revenue divided by the number of sale documents.
- Payment totals are grouped into **Cash**, **Card**, and **Bank Transfer**.
- Product and daily tables combine sales and reversals on the dates when those documents were recorded.
- A sale number opens the full document on the Sales page.
- **Export CSV** downloads the selected month's sales, reversal documents, and financial totals.

## Local Profile

- URL: `http://localhost:8081`
- Default username: `admin`
- Initial password: supplied through `APP_ADMIN_INITIAL_PASSWORD`
- Database: `flower-shop-local.db` in the project root

The application does not contain a default password. Before the first start with a new database, provide a strong, unique password through an environment variable:

```powershell
$env:APP_ADMIN_INITIAL_PASSWORD = "<strong-random-password>"
```

The password is used only when the administrator account is created for the first time. Only a bcrypt hash with a random salt is stored in the database. Subsequent application starts do not require this variable and do not overwrite the existing user. The initial username can optionally be changed through `APP_ADMIN_INITIAL_USERNAME`.

Never commit, publish, or document a real password in the repository.

## Single Production Build

```powershell
mvn package
java -jar .\target\inventory-0.1.0-SNAPSHOT.jar
```

Maven installs the pinned Node.js and pnpm versions in the `target` directory, builds the Angular application, and includes its static files in the Spring Boot JAR.

## Separate Frontend Development

Start the backend:

```powershell
mvn "-Dskip.frontend=true" spring-boot:run
```

Start the frontend with a proxy to `localhost:8081`:

```powershell
cd frontend
pnpm start
```

The development frontend will be available at `http://localhost:4200`.
