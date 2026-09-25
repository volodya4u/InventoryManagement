package com.flowershop.inventory.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class SqliteDecimalsTest {

    @Test
    void removesFloatingPointDriftFromDoubles() {
        assertThat(SqliteDecimals.normalize(new BigDecimal("0.19999999999999996")))
                .isEqualTo(new BigDecimal("0.2"));
        assertThat(SqliteDecimals.normalize(new BigDecimal("0.30000000000000004")))
                .isEqualTo(new BigDecimal("0.3"));
        assertThat(SqliteDecimals.normalize(new BigDecimal("349.99999999999994")))
                .isEqualTo(new BigDecimal("350"));
    }

    @Test
    void keepsValuesThatAreAlreadyExact() {
        var value = new BigDecimal("116.6667");

        assertThat(SqliteDecimals.normalize(value)).isSameAs(value);
        assertThat(SqliteDecimals.normalize(new BigDecimal("12.50"))).isEqualTo(new BigDecimal("12.50"));
        assertThat(SqliteDecimals.normalize(null)).isNull();
    }

    @Test
    void neverUsesExponentNotationForLargeWholeNumbers() {
        assertThat(SqliteDecimals.normalize(new BigDecimal("12345678901234567")).toString())
                .isEqualTo("12345678901234600");
    }
}
