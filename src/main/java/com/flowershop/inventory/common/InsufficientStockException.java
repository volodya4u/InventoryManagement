package com.flowershop.inventory.common;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

public class InsufficientStockException extends RuntimeException {

    private final List<StockShortage> shortages;

    public InsufficientStockException(List<StockShortage> shortages) {
        super(shortages.stream()
                .map(shortage -> "%s: required %s %s, available %s %s"
                        .formatted(
                                shortage.rawMaterialName(),
                                shortage.requiredQuantity().stripTrailingZeros().toPlainString(),
                                shortage.unit(),
                                shortage.availableQuantity().stripTrailingZeros().toPlainString(),
                                shortage.unit()))
                .collect(Collectors.joining("; ", "Insufficient raw materials: ", "")));
        this.shortages = List.copyOf(shortages);
    }

    public List<StockShortage> shortages() {
        return shortages;
    }

    public record StockShortage(
            long rawMaterialId,
            String rawMaterialName,
            String unit,
            BigDecimal requiredQuantity,
            BigDecimal availableQuantity,
            BigDecimal missingQuantity) {
    }
}
