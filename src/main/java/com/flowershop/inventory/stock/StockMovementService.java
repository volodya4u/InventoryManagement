package com.flowershop.inventory.stock;

import com.flowershop.inventory.stock.StockMovementRepository.StockMovementFilter;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StockMovementService {

    private final StockMovementRepository repository;

    public StockMovementService(StockMovementRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public StockMovementHistoryDto find(
            InventoryType inventoryType,
            StockMovementType movementType,
            String query,
            LocalDate from,
            LocalDate to,
            int page,
            int size) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new IllegalArgumentException("From date cannot be later than To date");
        }
        var normalizedQuery = query == null ? "" : query.trim();
        if (normalizedQuery.length() > 120) {
            throw new IllegalArgumentException("Search text cannot exceed 120 characters");
        }
        return repository.find(new StockMovementFilter(
                inventoryType,
                movementType,
                normalizedQuery,
                from,
                to,
                page,
                size));
    }
}
