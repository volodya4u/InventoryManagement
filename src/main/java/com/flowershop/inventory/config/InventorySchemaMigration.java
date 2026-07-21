package com.flowershop.inventory.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class InventorySchemaMigration implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    public InventorySchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!hasColumn("raw_material", "average_unit_cost")) {
            jdbcTemplate.execute("""
                    ALTER TABLE raw_material
                    ADD COLUMN average_unit_cost NUMERIC NOT NULL DEFAULT 0
                        CHECK (average_unit_cost >= 0)
                    """);
        }

        if (!tableDefinitionContains("raw_material_stock_movement", "'ADJUSTMENT_DECREASE'")) {
            migrateRawMaterialStockMovement();
        }

        if (!hasColumn("product", "average_unit_cost")) {
            jdbcTemplate.execute("""
                    ALTER TABLE product
                    ADD COLUMN average_unit_cost NUMERIC NOT NULL DEFAULT 0
                        CHECK (average_unit_cost >= 0)
                    """);
        }

        if (!hasColumn("product", "markup_percentage")) {
            jdbcTemplate.execute("""
                    ALTER TABLE product
                    ADD COLUMN markup_percentage NUMERIC NOT NULL DEFAULT 0
                        CHECK (markup_percentage >= 0)
                    """);
        }

        if (!hasColumn("sale", "status")) {
            jdbcTemplate.execute("""
                    ALTER TABLE sale
                    ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED'
                        CHECK (status IN ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED'))
                    """);
        }

        if (!hasColumn("product_stock_movement", "sale_id")
                || !hasColumn("product_stock_movement", "sale_return_id")
                || !tableDefinitionContains("product_stock_movement", "'SALE_CANCELLATION'")) {
            migrateProductStockMovement();
        }

        jdbcTemplate.update("""
                INSERT INTO raw_material_stock_movement
                    (raw_material_id, movement_type, quantity, unit_cost, total_cost, occurred_at, notes)
                SELECT id, 'OPENING_BALANCE', quantity, 0, 0, DATE(created_at),
                       'Opening balance migrated from the existing inventory'
                FROM raw_material material
                WHERE quantity > 0
                  AND NOT EXISTS (
                      SELECT 1
                      FROM raw_material_stock_movement movement
                      WHERE movement.raw_material_id = material.id
                  )
                """);

        jdbcTemplate.update("""
                INSERT INTO product_stock_movement
                    (product_id, movement_type, quantity, unit_cost, total_cost, occurred_at, notes)
                SELECT id, 'OPENING_BALANCE', quantity, 0, 0, DATE(created_at),
                       'Opening balance migrated from the existing inventory'
                FROM product item
                WHERE quantity > 0
                  AND NOT EXISTS (
                      SELECT 1
                      FROM product_stock_movement movement
                      WHERE movement.product_id = item.id
                  )
                """);
    }

    private void migrateRawMaterialStockMovement() {
        jdbcTemplate.execute("ALTER TABLE raw_material_stock_movement RENAME TO raw_material_stock_movement_old");
        jdbcTemplate.execute("""
                CREATE TABLE raw_material_stock_movement (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    raw_material_id INTEGER NOT NULL,
                    movement_type TEXT NOT NULL CHECK (
                        movement_type IN (
                            'OPENING_BALANCE', 'RECEIPT', 'PRODUCTION_CONSUMPTION',
                            'WRITE_OFF', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE')),
                    quantity NUMERIC NOT NULL CHECK (quantity > 0),
                    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
                    total_cost NUMERIC NOT NULL CHECK (total_cost >= 0),
                    occurred_at TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (raw_material_id) REFERENCES raw_material(id) ON DELETE CASCADE
                )
                """);
        jdbcTemplate.update("""
                INSERT INTO raw_material_stock_movement
                    (id, raw_material_id, movement_type, quantity, unit_cost,
                     total_cost, occurred_at, notes, created_at)
                SELECT id, raw_material_id, movement_type, quantity, unit_cost,
                       total_cost, occurred_at, notes, created_at
                FROM raw_material_stock_movement_old
                """);
        jdbcTemplate.execute("DROP TABLE raw_material_stock_movement_old");
        jdbcTemplate.execute("""
                CREATE INDEX idx_raw_material_stock_movement_material
                ON raw_material_stock_movement(raw_material_id, occurred_at)
                """);
    }

    private void migrateProductStockMovement() {
        jdbcTemplate.execute("ALTER TABLE product_stock_movement RENAME TO product_stock_movement_old");
        var oldTableHasSaleId = hasColumn("product_stock_movement_old", "sale_id");
        var oldTableHasSaleReturnId = hasColumn("product_stock_movement_old", "sale_return_id");
        jdbcTemplate.execute("""
                CREATE TABLE product_stock_movement (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    production_batch_id INTEGER,
                    sale_id INTEGER,
                    sale_return_id INTEGER,
                    movement_type TEXT NOT NULL CHECK (
                        movement_type IN (
                            'OPENING_BALANCE', 'PRODUCTION', 'SALE',
                            'WRITE_OFF', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE',
                            'SALE_RETURN', 'SALE_CANCELLATION')),
                    quantity NUMERIC NOT NULL CHECK (quantity > 0),
                    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
                    total_cost NUMERIC NOT NULL CHECK (total_cost >= 0),
                    occurred_at TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
                    FOREIGN KEY (production_batch_id) REFERENCES production_batch(id) ON DELETE CASCADE,
                    FOREIGN KEY (sale_id) REFERENCES sale(id) ON DELETE RESTRICT,
                    FOREIGN KEY (sale_return_id) REFERENCES sale_return(id) ON DELETE RESTRICT
                )
                """);
        if (oldTableHasSaleId && oldTableHasSaleReturnId) {
            jdbcTemplate.update("""
                    INSERT INTO product_stock_movement
                        (id, product_id, production_batch_id, sale_id, sale_return_id,
                         movement_type, quantity, unit_cost, total_cost, occurred_at, notes, created_at)
                    SELECT id, product_id, production_batch_id, sale_id, sale_return_id,
                           movement_type, quantity, unit_cost, total_cost, occurred_at, notes, created_at
                    FROM product_stock_movement_old
                    """);
        } else if (oldTableHasSaleId) {
            jdbcTemplate.update("""
                    INSERT INTO product_stock_movement
                        (id, product_id, production_batch_id, sale_id, movement_type, quantity,
                         unit_cost, total_cost, occurred_at, notes, created_at)
                    SELECT id, product_id, production_batch_id, sale_id, movement_type, quantity,
                           unit_cost, total_cost, occurred_at, notes, created_at
                    FROM product_stock_movement_old
                    """);
        } else {
            jdbcTemplate.update("""
                    INSERT INTO product_stock_movement
                        (id, product_id, production_batch_id, movement_type, quantity,
                         unit_cost, total_cost, occurred_at, notes, created_at)
                    SELECT id, product_id, production_batch_id, movement_type, quantity,
                           unit_cost, total_cost, occurred_at, notes, created_at
                    FROM product_stock_movement_old
                    """);
        }
        jdbcTemplate.execute("DROP TABLE product_stock_movement_old");
        jdbcTemplate.execute("""
                CREATE INDEX idx_product_stock_movement_product
                ON product_stock_movement(product_id, occurred_at)
                """);
    }

    private boolean hasColumn(String tableName, String columnName) {
        return Boolean.TRUE.equals(jdbcTemplate.query("PRAGMA table_info(" + tableName + ")", resultSet -> {
            while (resultSet.next()) {
                if (columnName.equalsIgnoreCase(resultSet.getString("name"))) {
                    return true;
                }
            }
            return false;
        }));
    }

    private boolean tableDefinitionContains(String tableName, String text) {
        return Boolean.TRUE.equals(jdbcTemplate.query(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
                resultSet -> resultSet.next() && resultSet.getString("sql").contains(text),
                tableName));
    }
}
