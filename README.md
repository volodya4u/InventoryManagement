# Flower Shop Inventory

A local inventory system for tracking raw materials and finished products for a flower shop.

## Current Features

- Secure session-based sign-in for a single administrator.
- The password is stored in SQLite as a one-way bcrypt hash.
- Raw material and finished product catalogs.
- Create, edit, and delete operations.
- Raw-material receipts and weighted-average inventory valuation.
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
