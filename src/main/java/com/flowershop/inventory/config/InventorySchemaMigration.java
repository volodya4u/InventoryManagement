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

        if (!tableDefinitionContains("raw_material_stock_movement", "PRODUCTION_CONSUMPTION")) {
            migrateRawMaterialStockMovement();
        }

        if (!hasColumn("product", "average_unit_cost")) {
            jdbcTemplate.execute("""
                    ALTER TABLE product
                    ADD COLUMN average_unit_cost NUMERIC NOT NULL DEFAULT 0
                        CHECK (average_unit_cost >= 0)
                    """);
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
                        movement_type IN ('OPENING_BALANCE', 'RECEIPT', 'PRODUCTION_CONSUMPTION')),
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
