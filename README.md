# Flower Shop Inventory

A local inventory system for tracking raw materials and finished products for a flower shop.

## Current Features

- Secure session-based sign-in for a single administrator.
- The password is stored in SQLite as a one-way bcrypt hash.
- Raw material and finished product catalogs.
- Create, edit, and delete operations.
- JPG, JPEG, and PNG images stored as BLOBs.
- Image validation in both the browser and the server.
- Maximum image size of 2 MB.
- The Angular production build is automatically included in the executable Spring Boot JAR.

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
