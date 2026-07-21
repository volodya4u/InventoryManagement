package com.flowershop.inventory.sales;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record SaleDto(
        long id,
        String saleNumber,
        LocalDate saleDate,
        PaymentMethod paymentMethod,
        SaleStatus status,
        String notes,
        BigDecimal totalRevenue,
        BigDecimal totalCost,
        BigDecimal grossProfit,
        BigDecimal refundedRevenue,
        BigDecimal returnedCost,
        BigDecimal reversedGrossProfit,
        BigDecimal netRevenue,
        BigDecimal netCost,
        BigDecimal netGrossProfit,
        List<SaleItemDto> items,
        List<SaleReturnDto> returns,
        String createdAt) {
}
