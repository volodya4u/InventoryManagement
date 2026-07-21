package com.flowershop.inventory.sales;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record SaleDto(
        long id,
        String saleNumber,
        LocalDate saleDate,
        PaymentMethod paymentMethod,
        String notes,
        BigDecimal totalRevenue,
        BigDecimal totalCost,
        BigDecimal grossProfit,
        List<SaleItemDto> items,
        String createdAt) {
}
