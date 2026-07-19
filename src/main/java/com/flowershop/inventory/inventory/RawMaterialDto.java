package com.flowershop.inventory.inventory;

import java.math.BigDecimal;

public record RawMaterialDto(
        long id,
        String name,
        String description,
        String unit,
        BigDecimal quantity,
        BigDecimal averageUnitCost,
        BigDecimal stockValue,
        boolean hasImage,
        String createdAt,
        String updatedAt) {
}
