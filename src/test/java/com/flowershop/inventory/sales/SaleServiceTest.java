package com.flowershop.inventory.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.flowershop.inventory.common.InsufficientProductStockException;
import com.flowershop.inventory.inventory.ProductDto;
import com.flowershop.inventory.inventory.ProductRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SaleServiceTest {

    private final SaleRepository repository = mock(SaleRepository.class);
    private final ProductRepository productRepository = mock(ProductRepository.class);
    private final SaleService service = new SaleService(repository, productRepository);

    @Test
    void rejectsIncompleteSaleBeforeAccessingRepositories() {
        assertThatThrownBy(() -> service.create(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sale date");

        verifyNoInteractions(repository, productRepository);
    }

    @Test
    void createsSaleUsingRoundedFinancialSnapshots() {
        var saleDate = LocalDate.of(2026, 10, 5);
        var product = product(3, "ROSE", "Rose bouquet", "10", "2.3456");
        var saved = sale(50, SaleStatus.COMPLETED, List.of(), saleDate);
        when(productRepository.findById(3)).thenReturn(Optional.of(product));
        when(repository.nextSaleNumber(saleDate)).thenReturn("SALE-20261005-001");
        when(repository.insert(
                        "SALE-20261005-001",
                        saleDate,
                        PaymentMethod.CARD,
                        "gift",
                        new BigDecimal("13.71"),
                        new BigDecimal("7.04"),
                        new BigDecimal("6.67")))
                .thenReturn(50L);
        when(productRepository.consumeStock(3, new BigDecimal("3"))).thenReturn(1);
        when(repository.findById(50)).thenReturn(Optional.of(saved));

        var result = service.create(new CreateSaleRequest(
                saleDate,
                PaymentMethod.CARD,
                "  gift  ",
                List.of(new SaleItemInput(3L, new BigDecimal("3"), new BigDecimal("4.567")))));

        assertThat(result).isSameAs(saved);
        var itemCaptor = ArgumentCaptor.forClass(SaleItemDto.class);
        verify(repository).insertItem(org.mockito.ArgumentMatchers.eq(50L), itemCaptor.capture());
        assertThat(itemCaptor.getValue()).satisfies(item -> {
            assertThat(item.unitPrice()).isEqualByComparingTo("4.57");
            assertThat(item.lineRevenue()).isEqualByComparingTo("13.71");
            assertThat(item.lineCost()).isEqualByComparingTo("7.04");
            assertThat(item.lineProfit()).isEqualByComparingTo("6.67");
        });
        verify(productRepository).insertStockMovement(
                3,
                null,
                50L,
                "SALE",
                new BigDecimal("3"),
                new BigDecimal("2.3456"),
                new BigDecimal("7.04"),
                saleDate,
                "Sale SALE-20261005-001");
    }

    @Test
    void reportsProductShortageBeforeCreatingSale() {
        when(productRepository.findById(3))
                .thenReturn(Optional.of(product(3, "ROSE", "Rose bouquet", "1", "2.0000")));

        assertThatThrownBy(() -> service.create(new CreateSaleRequest(
                        LocalDate.of(2026, 10, 5),
                        PaymentMethod.CASH,
                        null,
                        List.of(new SaleItemInput(3L, new BigDecimal("2"), BigDecimal.TEN)))))
                .isInstanceOfSatisfying(InsufficientProductStockException.class, exception -> {
                    assertThat(exception.shortages()).singleElement().satisfies(shortage -> {
                        assertThat(shortage.productId()).isEqualTo(3);
                        assertThat(shortage.missingQuantity()).isEqualByComparingTo("1");
                    });
                });

        verify(repository, never()).insert(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void partiallyReturnsProductsAndRestoresWeightedAverageStockCost() {
        var saleDate = LocalDate.of(2026, 10, 1);
        var saleItem = new SaleItemDto(
                9,
                3,
                "ROSE",
                "Rose bouquet",
                new BigDecimal("3"),
                new BigDecimal("5.00"),
                new BigDecimal("5.00"),
                new BigDecimal("2.00"),
                new BigDecimal("15.00"),
                new BigDecimal("6.00"),
                new BigDecimal("9.00"),
                new BigDecimal("1"),
                new BigDecimal("2.00"));
        var before = sale(50, SaleStatus.PARTIALLY_RETURNED, List.of(saleItem), saleDate);
        var after = sale(50, SaleStatus.PARTIALLY_RETURNED, List.of(saleItem), saleDate);
        when(repository.findById(50)).thenReturn(Optional.of(before), Optional.of(after));
        when(repository.nextReturnNumber(LocalDate.of(2026, 10, 5)))
                .thenReturn("RET-20261005-001");
        when(repository.insertReturn(
                        50,
                        "RET-20261005-001",
                        LocalDate.of(2026, 10, 5),
                        SaleReturnType.RETURN,
                        "Customer request",
                        "sealed",
                        new BigDecimal("5.00"),
                        new BigDecimal("2.00"),
                        new BigDecimal("3.00")))
                .thenReturn(77L);
        when(productRepository.findById(3))
                .thenReturn(Optional.of(product(3, "ROSE", "Rose bouquet", "2", "3.0000")));
        when(productRepository.updateStock(3, new BigDecimal("3"), new BigDecimal("2.6667")))
                .thenReturn(1);

        var result = service.returnProducts(
                50,
                new CreateSaleReturnRequest(
                        LocalDate.of(2026, 10, 5),
                        "  Customer request  ",
                        "  sealed  ",
                        List.of(new SaleReturnItemInput(9L, BigDecimal.ONE))));

        assertThat(result).isSameAs(after);
        verify(repository).updateStatus(50, SaleStatus.PARTIALLY_RETURNED);
        var itemCaptor = ArgumentCaptor.forClass(SaleReturnItemDto.class);
        verify(repository).insertReturnItem(org.mockito.ArgumentMatchers.eq(77L), itemCaptor.capture());
        assertThat(itemCaptor.getValue().lineCost()).isEqualByComparingTo("2.00");
        verify(productRepository).insertSaleReversalStockMovement(
                3,
                50,
                77,
                "SALE_RETURN",
                BigDecimal.ONE,
                new BigDecimal("2.00"),
                new BigDecimal("2.00"),
                LocalDate.of(2026, 10, 5),
                "Return RET-20261005-001 for SALE-50");
    }

    @Test
    void refusesToCancelSaleThatAlreadyHasReturns() {
        when(repository.findById(50)).thenReturn(Optional.of(sale(
                50,
                SaleStatus.PARTIALLY_RETURNED,
                List.of(),
                LocalDate.of(2026, 10, 1))));

        assertThatThrownBy(() -> service.cancel(
                        50,
                        new CancelSaleRequest(
                                LocalDate.of(2026, 10, 5), "Mistake", null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Only a completed sale without previous returns can be cancelled");

        verify(repository, never()).insertReturn(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    private ProductDto product(
            long id, String sku, String name, String quantity, String averageUnitCost) {
        var stockQuantity = new BigDecimal(quantity);
        var unitCost = new BigDecimal(averageUnitCost);
        return new ProductDto(
                id,
                sku,
                name,
                "",
                stockQuantity,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                new BigDecimal("5.00"),
                unitCost,
                stockQuantity.multiply(unitCost),
                List.of(),
                false,
                "created",
                "updated");
    }

    private SaleDto sale(
            long id, SaleStatus status, List<SaleItemDto> items, LocalDate saleDate) {
        return new SaleDto(
                id,
                "SALE-" + id,
                saleDate,
                PaymentMethod.CARD,
                status,
                "",
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                items,
                List.of(),
                "created");
    }
}
