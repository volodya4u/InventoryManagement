package com.flowershop.inventory.inventory;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record StockWriteOffRequest(
        @NotNull @DecimalMin(value = "0.0", inclusive = false) BigDecimal quantity,
        @NotNull LocalDate operationDate,
        @NotBlank @Size(max = 200) String reason,
        @Size(max = 1000) String notes) {
}
