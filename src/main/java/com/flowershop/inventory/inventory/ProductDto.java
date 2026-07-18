package com.flowershop.inventory.inventory;

import java.math.BigDecimal;

public record ProductDto(
        long id,
        String sku,
        String name,
        String description,
        BigDecimal quantity,
        BigDecimal price,
        boolean hasImage,
        String createdAt,
        String updatedAt) {
}
