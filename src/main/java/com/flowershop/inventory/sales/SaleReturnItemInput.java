package com.flowershop.inventory.sales;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record SaleReturnItemInput(
        @NotNull Long saleItemId,
        @NotNull @DecimalMin(value = "0.0", inclusive = false)
        @Digits(integer = 12, fraction = 0) BigDecimal quantity) {
}
