package com.flowershop.inventory.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.flowershop.inventory.common.InsufficientProductStockException;
import com.flowershop.inventory.common.InsufficientStockException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

// Real threads against the real services and the real pool. It has its own in-memory database, apart from the one the
// MockMvc tests share.
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:file:stock-concurrency-test?mode=memory&cache=shared")
@ActiveProfiles("test")
class StockDeductionConcurrencyTest {

    private static final int WRITERS = 8;

    @Autowired
    private RawMaterialService rawMaterialService;

    @Autowired
    private ProductService productService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Value("${spring.datasource.hikari.maximum-pool-size}")
    private int poolSize;

    // @trace NFR-13
    @Test
    void keepsTheConnectionPoolAtOneConnection() {
        assertThat(poolSize).isEqualTo(1);
    }

    // @trace NFR-13
    @Test
    void allowsOnlyAsManyRawMaterialWriteOffsSucceedAsTheStockCovers() throws Exception {
        jdbcTemplate.update("DELETE FROM raw_material WHERE name = 'Concurrent Rose'");
        jdbcTemplate.update("""
                INSERT INTO raw_material (name, description, unit, quantity, average_unit_cost)
                VALUES ('Concurrent Rose', '', 'PIECE', 10, 5)
                """);
        long id = jdbcTemplate.queryForObject(
                "SELECT id FROM raw_material WHERE name = 'Concurrent Rose'", Long.class);

        var outcomes = runConcurrently(() -> {
            try {
                rawMaterialService.writeOffStock(id, new BigDecimal("3"), LocalDate.of(2026, 7, 21), "Wilted", null);
                return "written off";
            } catch (InsufficientStockException exception) {
                return "refused";
            }
        });

        assertThat(outcomes.stream().filter("written off"::equals)).hasSize(3);
        assertThat(outcomes.stream().filter("refused"::equals)).hasSize(WRITERS - 3);
        assertThat(jdbcTemplate.queryForObject("SELECT quantity FROM raw_material WHERE id = ?", BigDecimal.class, id))
                .isEqualByComparingTo("1");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM raw_material_stock_movement WHERE raw_material_id = ? AND movement_type = 'WRITE_OFF'",
                Integer.class, id)).isEqualTo(3);
    }

    // @trace NFR-13
    @Test
    void allowsOnlyAsManyProductWriteOffsSucceedAsTheStockCovers() throws Exception {
        jdbcTemplate.update("DELETE FROM product WHERE sku = 'CONCURRENT-1'");
        jdbcTemplate.update("""
                INSERT INTO product (sku, name, description, quantity, price, average_unit_cost)
                VALUES ('CONCURRENT-1', 'Concurrent Box', '', 10, 40, 20)
                """);
        long id = jdbcTemplate.queryForObject("SELECT id FROM product WHERE sku = 'CONCURRENT-1'", Long.class);

        var outcomes = runConcurrently(() -> {
            try {
                productService.writeOffStock(id, new BigDecimal("3"), LocalDate.of(2026, 7, 21), "Damaged", null);
                return "written off";
            } catch (InsufficientProductStockException exception) {
                return "refused";
            }
        });

        assertThat(outcomes.stream().filter("written off"::equals)).hasSize(3);
        assertThat(outcomes.stream().filter("refused"::equals)).hasSize(WRITERS - 3);
        assertThat(jdbcTemplate.queryForObject("SELECT quantity FROM product WHERE id = ?", BigDecimal.class, id))
                .isEqualByComparingTo("1");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement WHERE product_id = ? AND movement_type = 'WRITE_OFF'",
                Integer.class, id)).isEqualTo(3);
    }

    /** Starts every writer behind one latch so they all begin together, and returns what each one reported. */
    private List<String> runConcurrently(Callable<String> writer) throws Exception {
        var executor = Executors.newFixedThreadPool(WRITERS);
        try {
            var start = new CountDownLatch(1);
            var futures = new ArrayList<Future<String>>();
            for (int index = 0; index < WRITERS; index++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return writer.call();
                }));
            }
            start.countDown();
            var outcomes = new ArrayList<String>();
            for (var future : futures) {
                outcomes.add(future.get());
            }
            return outcomes;
        } finally {
            executor.shutdownNow();
        }
    }
}
