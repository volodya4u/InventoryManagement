package com.flowershop.inventory.inventory;

import java.math.BigDecimal;
import java.util.List;

public record ProductDto(
        long id,
        String sku,
        String name,
        String description,
        BigDecimal quantity,
        BigDecimal markupPercentage,
        BigDecimal sellingPrice,
        BigDecimal averageUnitCost,
        BigDecimal stockValue,
        List<ProductRecipeItemDto> recipe,
        boolean hasImage,
        String createdAt,
        String updatedAt) {
}
