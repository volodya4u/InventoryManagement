package com.flowershop.inventory.sales;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record CreateSaleReturnRequest(
        @NotNull LocalDate returnDate,
        @NotBlank @Size(max = 200) String reason,
        @Size(max = 1000) String notes,
        @NotEmpty List<@Valid SaleReturnItemInput> items) {
}
