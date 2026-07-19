package com.flowershop.inventory.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

class InventorySchemaMigrationTest {

    @Test
    void migratesAnExistingRawMaterialTableAndIsIdempotent() throws Exception {
        var dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        try {
            var jdbcTemplate = new JdbcTemplate(dataSource);
            jdbcTemplate.execute("""
                    CREATE TABLE raw_material (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        quantity NUMERIC NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE raw_material_stock_movement (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        raw_material_id INTEGER NOT NULL,
                        movement_type TEXT NOT NULL,
                        quantity NUMERIC NOT NULL,
                        unit_cost NUMERIC NOT NULL,
                        total_cost NUMERIC NOT NULL,
                        occurred_at TEXT NOT NULL,
                        notes TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """);
            jdbcTemplate.update("INSERT INTO raw_material (quantity) VALUES (5)");

            var migration = new InventorySchemaMigration(jdbcTemplate);
            var arguments = new DefaultApplicationArguments(new String[0]);
            migration.run(arguments);
            migration.run(arguments);

            var columns = jdbcTemplate.queryForList("PRAGMA table_info(raw_material)");
            assertThat(columns)
                    .extracting(column -> column.get("name"))
                    .contains("average_unit_cost");
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT average_unit_cost FROM raw_material WHERE id = 1",
                    Integer.class)).isZero();
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM raw_material_stock_movement WHERE raw_material_id = 1",
                    Integer.class)).isEqualTo(1);
        } finally {
            dataSource.destroy();
        }
    }
}
