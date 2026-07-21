package com.flowershop.inventory.sales;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;

public record SaleItemInput(
        @NotNull @Positive Long productId,
        @NotNull @DecimalMin(value = "0.0", inclusive = false)
        @Digits(integer = 12, fraction = 0) BigDecimal quantity,
        @NotNull @DecimalMin("0.0")
        @Digits(integer = 12, fraction = 2) BigDecimal unitPrice) {
}
