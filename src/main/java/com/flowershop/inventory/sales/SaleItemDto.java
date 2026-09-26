package com.flowershop.inventory.sales;

import java.math.BigDecimal;

public record SaleItemDto(
        long id,
        long productId,
        String productSku,
        String productName,
        BigDecimal quantity,
        BigDecimal recommendedUnitPrice,
        BigDecimal unitPrice,
        BigDecimal unitCost,
        BigDecimal lineRevenue,
        BigDecimal lineCost,
        BigDecimal lineProfit,
        BigDecimal returnedQuantity,
        BigDecimal returnedCost) {
}
