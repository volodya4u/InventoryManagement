package com.flowershop.inventory.stock;

import java.math.BigDecimal;
import java.time.LocalDate;

public record StockMovementDto(
        String inventoryType,
        long movementId,
        long itemId,
        String itemCode,
        String itemName,
        String unit,
        String movementType,
        String direction,
        BigDecimal quantity,
        BigDecimal signedQuantity,
        BigDecimal unitCost,
        BigDecimal totalCost,
        BigDecimal signedTotalCost,
        LocalDate occurredAt,
        String notes,
        String referenceType,
        Long referenceId,
        String referenceNumber,
        String createdAt) {
}
