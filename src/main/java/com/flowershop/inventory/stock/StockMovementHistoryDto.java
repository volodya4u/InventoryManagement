package com.flowershop.inventory.stock;

import java.math.BigDecimal;
import java.util.List;

public record StockMovementHistoryDto(
        List<StockMovementDto> movements,
        long totalElements,
        int page,
        int size,
        int totalPages,
        Totals totals) {

    public record Totals(
            long movementCount,
            BigDecimal incomingValue,
            BigDecimal outgoingValue,
            BigDecimal netValueChange) {
    }
}
