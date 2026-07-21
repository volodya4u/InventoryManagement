package com.flowershop.inventory.sales;

import java.math.BigDecimal;

public record SaleItemDto(
        long productId,
        String productSku,
        String productName,
        BigDecimal quantity,
        BigDecimal recommendedUnitPrice,
        BigDecimal unitPrice,
        BigDecimal unitCost,
        BigDecimal lineRevenue,
        BigDecimal lineCost,
        BigDecimal lineProfit) {
}
