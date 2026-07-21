package com.flowershop.inventory.sales;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record CancelSaleRequest(
        @NotNull LocalDate cancellationDate,
        @NotBlank @Size(max = 200) String reason,
        @Size(max = 1000) String notes) {
}
