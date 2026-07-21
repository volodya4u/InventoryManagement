package com.flowershop.inventory.common;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

public class InsufficientProductStockException extends RuntimeException {

    private final List<ProductShortage> shortages;

    public InsufficientProductStockException(List<ProductShortage> shortages) {
        super(shortages.stream()
                .map(shortage -> "%s: required %s, available %s"
                        .formatted(
                                shortage.productName(),
                                shortage.requiredQuantity().stripTrailingZeros().toPlainString(),
                                shortage.availableQuantity().stripTrailingZeros().toPlainString()))
                .collect(Collectors.joining("; ", "Insufficient product stock: ", "")));
        this.shortages = List.copyOf(shortages);
    }

    public List<ProductShortage> shortages() {
        return shortages;
    }

    public record ProductShortage(
            long productId,
            String productSku,
            String productName,
            BigDecimal requiredQuantity,
            BigDecimal availableQuantity,
            BigDecimal missingQuantity) {
    }
}
