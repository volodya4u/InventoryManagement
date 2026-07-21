package com.flowershop.inventory.inventory;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record StockAdjustmentRequest(
        @NotNull @DecimalMin("0.0") BigDecimal actualQuantity,
        @NotNull LocalDate operationDate,
        @NotBlank @Size(max = 200) String reason,
        @Size(max = 1000) String notes) {
}
