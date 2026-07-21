package com.flowershop.inventory.sales;

import java.math.BigDecimal;

public record SaleReturnItemDto(
        long saleItemId,
        long productId,
        String productSku,
        String productName,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal unitCost,
        BigDecimal lineRefund,
        BigDecimal lineCost,
        BigDecimal grossProfitReversal) {
}
