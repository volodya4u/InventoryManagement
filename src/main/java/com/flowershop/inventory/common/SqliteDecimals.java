package com.flowershop.inventory.common;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * Reads NUMERIC columns, which SQLite stores as binary doubles.
 *
 * <p>SQLite renders REAL values with full round-trip precision, so arithmetic drift such as
 * {@code 1 - 0.8 = 0.19999999999999996} or {@code SUM(0.1, 0.2) = 0.30000000000000004} would
 * reach the API. Values are rounded to 15 significant digits, the precision a double holds
 * reliably, which matches how SQLite 3.51 and earlier rendered them.
 */
public final class SqliteDecimals {

    private static final int DOUBLE_DIGITS = 15;
    private static final MathContext DOUBLE_PRECISION = new MathContext(DOUBLE_DIGITS, RoundingMode.HALF_EVEN);

    private SqliteDecimals() {
    }

    public static BigDecimal read(ResultSet rs, String column) throws SQLException {
        return normalize(rs.getBigDecimal(column));
    }

    public static BigDecimal normalize(BigDecimal value) {
        if (value == null || value.precision() <= DOUBLE_DIGITS) {
            return value;
        }
        var rounded = value.round(DOUBLE_PRECISION).stripTrailingZeros();
        return rounded.scale() < 0 ? rounded.setScale(0) : rounded;
    }
}
