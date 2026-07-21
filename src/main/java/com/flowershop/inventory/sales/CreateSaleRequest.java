package com.flowershop.inventory.sales;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record CreateSaleRequest(
        @NotNull LocalDate saleDate,
        @NotNull PaymentMethod paymentMethod,
        @Size(max = 1000) String notes,
        @NotEmpty @Size(max = 100) List<@Valid SaleItemInput> items) {
}
