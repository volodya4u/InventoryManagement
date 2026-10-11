package com.flowershop.inventory.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

class StockQuantitiesTest {

    private SingleConnectionDataSource dataSource;
    private RacingJdbcTemplate jdbcTemplate;

    @BeforeEach
    void createStockTable() {
        dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbcTemplate = new RacingJdbcTemplate(dataSource);
        jdbcTemplate.execute("""
                CREATE TABLE raw_material (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    quantity NUMERIC NOT NULL CHECK (quantity >= 0),
                    updated_at TEXT
                )
                """);
        jdbcTemplate.update("INSERT INTO raw_material (quantity) VALUES (10)");
    }

    @AfterEach
    void closeConnection() {
        dataSource.destroy();
    }

    // @trace NFR-13
    @Test
    void doesNotOverwriteADeductionThatAnotherWriterMadeAfterTheRead() {
        // Writer B reads 10 and wants 8 left over 2; writer A deducts 6 (leaving 4) between B's read and B's write.
        jdbcTemplate.beforeNextUpdate(() -> jdbcTemplate.update("UPDATE raw_material SET quantity = 4 WHERE id = 1"));

        int updated = StockQuantities.consume(jdbcTemplate, "raw_material", 1, new BigDecimal("8"));

        assertThat(updated).isZero();
        assertThat(quantity()).isEqualByComparingTo("4");
    }

    // @trace NFR-13
    @Test
    void neverDrivesStockBelowZero() {
        assertThat(StockQuantities.consume(jdbcTemplate, "raw_material", 1, new BigDecimal("10.01"))).isZero();
        assertThat(quantity()).isEqualByComparingTo("10");

        assertThat(StockQuantities.consume(jdbcTemplate, "raw_material", 1, new BigDecimal("10"))).isEqualTo(1);
        assertThat(quantity()).isEqualByComparingTo("0");
        assertThat(StockQuantities.consume(jdbcTemplate, "raw_material", 1, new BigDecimal("0.01"))).isZero();
        assertThat(quantity()).isEqualByComparingTo("0");
    }

    // @trace NFR-13
    @Test
    void updatesNothingForAnUnknownRow() {
        assertThat(StockQuantities.consume(jdbcTemplate, "raw_material", 99, new BigDecimal("1"))).isZero();
        assertThat(quantity()).isEqualByComparingTo("10");
    }

    private BigDecimal quantity() {
        return jdbcTemplate.queryForObject("SELECT quantity FROM raw_material WHERE id = 1", BigDecimal.class);
    }

    /** A JdbcTemplate that lets a competing writer act just before the next write statement. */
    private static final class RacingJdbcTemplate extends JdbcTemplate {

        private Runnable beforeNextUpdate;

        RacingJdbcTemplate(DataSource dataSource) {
            super(dataSource);
        }

        void beforeNextUpdate(Runnable competingWrite) {
            this.beforeNextUpdate = competingWrite;
        }

        @Override
        public int update(String sql, Object... args) {
            var competingWrite = beforeNextUpdate;
            beforeNextUpdate = null;
            if (competingWrite != null) {
                competingWrite.run();
            }
            return super.update(sql, args);
        }
    }
}
