package com.flowershop.inventory.sales;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record SaleReturnDto(
        long id,
        String returnNumber,
        LocalDate returnDate,
        SaleReturnType operationType,
        String reason,
        String notes,
        BigDecimal totalRefund,
        BigDecimal totalCost,
        BigDecimal grossProfitReversal,
        List<SaleReturnItemDto> items,
        String createdAt) {
}
