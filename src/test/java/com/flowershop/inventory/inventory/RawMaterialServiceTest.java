package com.flowershop.inventory.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.flowershop.inventory.common.ConflictException;
import com.flowershop.inventory.common.InsufficientStockException;
import com.flowershop.inventory.image.ImagePayload;
import com.flowershop.inventory.image.ImageValidator;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.multipart.MultipartFile;

class RawMaterialServiceTest {

    private final RawMaterialRepository repository = mock(RawMaterialRepository.class);
    private final ImageValidator imageValidator = mock(ImageValidator.class);
    private final RawMaterialService service = new RawMaterialService(repository, imageValidator);

    @Test
    void createsMaterialAndRecordsOpeningStock() {
        var image = mock(MultipartFile.class);
        var payload = new ImagePayload(new byte[] {1}, "image/png");
        var created = material(7, "Rose", "2", "1.2346", true);
        when(imageValidator.validate(image)).thenReturn(payload);
        when(repository.insert(
                        "Rose",
                        "Fresh",
                        MeasurementUnit.PIECE,
                        new BigDecimal("2"),
                        new BigDecimal("1.2346"),
                        payload))
                .thenReturn(7L);
        when(repository.findById(7)).thenReturn(Optional.of(created));

        var earliestOpeningDate = LocalDate.now();
        var result = service.create(
                "  Rose  ",
                "  Fresh  ",
                "piece",
                new BigDecimal("2"),
                new BigDecimal("1.23456"),
                image);
        var latestOpeningDate = LocalDate.now();

        assertThat(result).isSameAs(created);
        var openingDate = ArgumentCaptor.forClass(LocalDate.class);
        verify(repository).insertStockMovement(
                eq(7L),
                eq("OPENING_BALANCE"),
                eq(new BigDecimal("2")),
                eq(new BigDecimal("1.2346")),
                eq(new BigDecimal("2.4692")),
                openingDate.capture(),
                eq("Initial stock"));
        assertThat(openingDate.getValue()).isIn(earliestOpeningDate, latestOpeningDate);
    }

    @Test
    void requiresUnitCostWhenOpeningStockIsPositive() {
        assertThatThrownBy(() -> service.create(
                        "Rose", null, "PIECE", BigDecimal.ONE, null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Initial unit cost is required when initial stock is greater than zero");

        verifyNoInteractions(repository, imageValidator);
    }

    @Test
    void receivesStockUsingWeightedAverageCost() {
        var existing = material(4, "Ribbon", "10", "2.0000", true);
        var updated = material(4, "Ribbon", "15", "2.3333", true);
        when(repository.findById(4)).thenReturn(Optional.of(existing), Optional.of(updated));
        when(repository.updateStock(4, new BigDecimal("15"), new BigDecimal("2.3333")))
                .thenReturn(1);

        var result = service.receiveStock(
                4,
                new BigDecimal("5"),
                new BigDecimal("3"),
                LocalDate.of(2026, 10, 5),
                "  supplier delivery  ");

        assertThat(result).isSameAs(updated);
        verify(repository).insertStockMovement(
                4,
                "RECEIPT",
                new BigDecimal("5"),
                new BigDecimal("3.0000"),
                new BigDecimal("15.0000"),
                LocalDate.of(2026, 10, 5),
                "supplier delivery");
    }

    @Test
    void rejectsWriteOffWhenStockIsInsufficient() {
        when(repository.findById(4))
                .thenReturn(Optional.of(material(4, "Ribbon", "2", "1.5000", true)));

        assertThatThrownBy(() -> service.writeOffStock(
                        4,
                        new BigDecimal("3"),
                        LocalDate.of(2026, 10, 5),
                        "Damaged",
                        null))
                .isInstanceOfSatisfying(InsufficientStockException.class, exception -> {
                    assertThat(exception.shortages()).singleElement().satisfies(shortage -> {
                        assertThat(shortage.rawMaterialId()).isEqualTo(4);
                        assertThat(shortage.requiredQuantity()).isEqualByComparingTo("3");
                        assertThat(shortage.availableQuantity()).isEqualByComparingTo("2");
                        assertThat(shortage.missingQuantity()).isEqualByComparingTo("1");
                    });
                });

        verify(repository, never()).consumeStock(4, new BigDecimal("3"));
    }

    @Test
    void refusesToDeleteMaterialUsedByARecipe() {
        when(repository.findById(4))
                .thenReturn(Optional.of(material(4, "Ribbon", "0", "0", false)));
        when(repository.findRecipeProductNames(4)).thenReturn(List.of("Wedding bouquet"));

        assertThatThrownBy(() -> service.delete(4))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Wedding bouquet");

        verify(repository, never()).delete(4);
    }

    private RawMaterialDto material(
            long id,
            String name,
            String quantity,
            String averageUnitCost,
            boolean unitChangeable) {
        var stockQuantity = new BigDecimal(quantity);
        var unitCost = new BigDecimal(averageUnitCost);
        return new RawMaterialDto(
                id,
                name,
                "",
                "PIECE",
                stockQuantity,
                unitCost,
                stockQuantity.multiply(unitCost),
                false,
                unitChangeable,
                "created",
                "updated");
    }
}
