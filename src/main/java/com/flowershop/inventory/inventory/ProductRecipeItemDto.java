package com.flowershop.inventory.inventory;

import java.math.BigDecimal;

public record ProductRecipeItemDto(
        long rawMaterialId,
        String rawMaterialName,
        String unit,
        BigDecimal quantityPerUnit,
        BigDecimal availableQuantity,
        BigDecimal averageUnitCost) {
}
