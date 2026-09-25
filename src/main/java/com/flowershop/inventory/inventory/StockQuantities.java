package com.flowershop.inventory.inventory;

import com.flowershop.inventory.common.SqliteDecimals;
import java.math.BigDecimal;
import org.springframework.jdbc.core.JdbcTemplate;

final class StockQuantities {

    private record StoredQuantity(Object raw, BigDecimal value) {
    }

    private StockQuantities() {
    }

    /**
     * Subtracts {@code quantity} from a row's stock when enough is available and returns the number
     * of updated rows. The subtraction is done with BigDecimal because REAL arithmetic in SQL drifts
     * ({@code 1 - 0.8 = 0.19999999999999996}); the update only applies while the stored value is
     * still the one that was read, so the check and the write stay atomic.
     */
    static int consume(JdbcTemplate jdbcTemplate, String table, long id, BigDecimal quantity) {
        var stored = jdbcTemplate.query(
                "SELECT quantity FROM %s WHERE id = ?".formatted(table),
                (rs, rowNum) -> new StoredQuantity(
                        rs.getObject("quantity"),
                        SqliteDecimals.read(rs, "quantity")),
                id);
        if (stored.isEmpty()) {
            return 0;
        }
        var current = stored.getFirst();
        var remaining = current.value().subtract(quantity);
        if (remaining.signum() < 0) {
            return 0;
        }
        return jdbcTemplate.update(
                """
                UPDATE %s
                SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND quantity = ?
                """.formatted(table),
                remaining,
                id,
                current.raw());
    }
}
