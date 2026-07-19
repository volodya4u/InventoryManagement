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
        if (!hasRawMaterialColumn("average_unit_cost")) {
            jdbcTemplate.execute("""
                    ALTER TABLE raw_material
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
    }

    private boolean hasRawMaterialColumn(String columnName) {
        return Boolean.TRUE.equals(jdbcTemplate.query("PRAGMA table_info(raw_material)", resultSet -> {
            while (resultSet.next()) {
                if (columnName.equalsIgnoreCase(resultSet.getString("name"))) {
                    return true;
                }
            }
            return false;
        }));
    }
}
