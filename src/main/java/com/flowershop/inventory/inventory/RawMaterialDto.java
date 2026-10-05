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
        BigDecimal reorderLevel,
        boolean belowReorderLevel,
        boolean hasImage,
        boolean unitChangeable,
        String createdAt,
        String updatedAt) {
}
