package com.flowershop.inventory.stock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.flowershop.inventory.stock.StockMovementHistoryDto.Totals;
import com.flowershop.inventory.stock.StockMovementRepository.StockMovementFilter;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class StockMovementServiceTest {

    private final StockMovementRepository repository = mock(StockMovementRepository.class);
    private final StockMovementService service = new StockMovementService(repository);

    @Test
    void rejectsFromDateLaterThanToDate() {
        assertThatThrownBy(() -> service.find(
                        InventoryType.ALL,
                        null,
                        null,
                        LocalDate.of(2026, 10, 6),
                        LocalDate.of(2026, 10, 5),
                        0,
                        25))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("From date cannot be later than To date");

        verifyNoInteractions(repository);
    }

    @Test
    void rejectsSearchTextLongerThan120Characters() {
        assertThatThrownBy(() -> service.find(
                        InventoryType.PRODUCT,
                        StockMovementType.SALE,
                        "x".repeat(121),
                        null,
                        null,
                        0,
                        25))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Search text cannot exceed 120 characters");

        verifyNoInteractions(repository);
    }

    @Test
    void trimsSearchTextAndForwardsTheCompleteFilter() {
        var expectedFilter = new StockMovementFilter(
                InventoryType.RAW_MATERIAL,
                StockMovementType.RECEIPT,
                "roses",
                LocalDate.of(2026, 9, 1),
                LocalDate.of(2026, 9, 30),
                2,
                10);
        var expectedHistory = emptyHistory(2, 10);
        when(repository.find(expectedFilter)).thenReturn(expectedHistory);

        var history = service.find(
                InventoryType.RAW_MATERIAL,
                StockMovementType.RECEIPT,
                "  roses  ",
                LocalDate.of(2026, 9, 1),
                LocalDate.of(2026, 9, 30),
                2,
                10);

        assertThat(history).isSameAs(expectedHistory);
        verify(repository).find(expectedFilter);
    }

    @Test
    void convertsNullSearchTextToAnEmptyString() {
        var expectedFilter = new StockMovementFilter(
                InventoryType.ALL,
                null,
                "",
                null,
                null,
                0,
                50);
        var expectedHistory = emptyHistory(0, 50);
        when(repository.find(expectedFilter)).thenReturn(expectedHistory);

        var history = service.find(
                InventoryType.ALL,
                null,
                null,
                null,
                null,
                0,
                50);

        assertThat(history).isSameAs(expectedHistory);
        verify(repository).find(expectedFilter);
    }

    private StockMovementHistoryDto emptyHistory(int page, int size) {
        return new StockMovementHistoryDto(
                List.of(),
                0,
                page,
                size,
                0,
                new Totals(0, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO));
    }
}
