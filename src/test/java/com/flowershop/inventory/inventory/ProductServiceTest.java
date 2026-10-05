package com.flowershop.inventory.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
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

class ProductServiceTest {

    private final ProductRepository repository = mock(ProductRepository.class);
    private final RawMaterialRepository rawMaterialRepository = mock(RawMaterialRepository.class);
    private final ImageValidator imageValidator = mock(ImageValidator.class);
    private final ProductService service =
            new ProductService(repository, rawMaterialRepository, imageValidator);

    @Test
    void createsProductWithCalculatedSellingPriceAndOpeningMovement() {
        var image = mock(MultipartFile.class);
        var payload = new ImagePayload(new byte[] {1}, "image/png");
        var recipe = List.of(new ProductRecipeItemInput(11L, new BigDecimal("2")));
        var rawMaterial = material(11, "Rose", "100", "3.0000");
        var created = product(8, "BOUQUET", "Bouquet", "2", "4.5679", recipeDto());
        when(rawMaterialRepository.findById(11)).thenReturn(Optional.of(rawMaterial));
        when(imageValidator.validate(image)).thenReturn(payload);
        when(repository.insert(
                        "BOUQUET",
                        "Bouquet",
                        "Seasonal",
                        new BigDecimal("2"),
                        new BigDecimal("25.00"),
                        new BigDecimal("1.00"),
                        new BigDecimal("8.75"),
                        new BigDecimal("4.5679"),
                        payload))
                .thenReturn(8L);
        when(repository.findById(8)).thenReturn(Optional.of(created));

        var earliestOpeningDate = LocalDate.now();
        var result = service.create(
                "  BOUQUET  ",
                "  Bouquet  ",
                "  Seasonal  ",
                new BigDecimal("2"),
                new BigDecimal("4.56789"),
                BigDecimal.ONE,
                new BigDecimal("25"),
                recipe,
                image);
        var latestOpeningDate = LocalDate.now();

        assertThat(result).isSameAs(created);
        verify(repository).replaceRecipe(8, recipe);
        var openingDate = ArgumentCaptor.forClass(LocalDate.class);
        verify(repository).insertStockMovement(
                eq(8L),
                eq(null),
                eq(null),
                eq("OPENING_BALANCE"),
                eq(new BigDecimal("2")),
                eq(new BigDecimal("4.5679")),
                eq(new BigDecimal("9.1358")),
                openingDate.capture(),
                eq("Initial product stock"));
        assertThat(openingDate.getValue()).isIn(earliestOpeningDate, latestOpeningDate);
    }

    @Test
    void rejectsDuplicateSkuBeforeValidatingRecipeOrImage() {
        when(repository.existsBySku("BOUQUET", 0)).thenReturn(true);

        assertThatThrownBy(() -> service.create(
                        " BOUQUET ",
                        "Bouquet",
                        null,
                        BigDecimal.ZERO,
                        null,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        List.of(new ProductRecipeItemInput(11L, BigDecimal.ONE)),
                        null))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("BOUQUET");

        verifyNoInteractions(rawMaterialRepository, imageValidator);
    }

    @Test
    void reportsEveryRawMaterialShortageBeforeStartingProduction() {
        var recipe = List.of(
                new ProductRecipeItemDto(
                        11,
                        "Rose",
                        "PIECE",
                        new BigDecimal("2"),
                        new BigDecimal("5"),
                        new BigDecimal("2.0000")),
                new ProductRecipeItemDto(
                        12,
                        "Ribbon",
                        "METER",
                        BigDecimal.ONE,
                        BigDecimal.ONE,
                        BigDecimal.ONE));
        var product = product(8, "BOUQUET", "Bouquet", "0", "0", recipe);
        when(repository.findById(8)).thenReturn(Optional.of(product));
        when(rawMaterialRepository.findById(11))
                .thenReturn(Optional.of(material(11, "Rose", "5", "2.0000")));
        when(rawMaterialRepository.findById(12))
                .thenReturn(Optional.of(material(12, "Ribbon", "1", "1.0000")));

        assertThatThrownBy(() -> service.produce(
                        8, new BigDecimal("3"), LocalDate.of(2026, 10, 5), null))
                .isInstanceOfSatisfying(InsufficientStockException.class, exception -> {
                    assertThat(exception.shortages())
                            .extracting(shortage -> shortage.rawMaterialId())
                            .containsExactly(11L, 12L);
                    assertThat(exception.shortages().get(0).missingQuantity())
                            .isEqualByComparingTo("1");
                    assertThat(exception.shortages().get(1).missingQuantity())
                            .isEqualByComparingTo("2");
                });

        verify(repository, never()).insertProductionBatch(
                anyLong(),
                any(BigDecimal.class),
                any(BigDecimal.class),
                any(BigDecimal.class),
                any(BigDecimal.class),
                any(LocalDate.class),
                anyString());
    }

    @Test
    void producesStockAndUpdatesWeightedAverageCost() {
        var recipe = recipeDto();
        var before = product(8, "BOUQUET", "Bouquet", "2", "10.0000", recipe);
        var after = product(8, "BOUQUET", "Bouquet", "4", "7.7500", recipe);
        var material = material(11, "Rose", "20", "2.0000");
        when(repository.findById(8)).thenReturn(Optional.of(before), Optional.of(after));
        when(rawMaterialRepository.findById(11)).thenReturn(Optional.of(material));
        when(repository.insertProductionBatch(
                        8,
                        new BigDecimal("2"),
                        new BigDecimal("5.5000"),
                        new BigDecimal("11.0000"),
                        new BigDecimal("3.00"),
                        LocalDate.of(2026, 10, 5),
                        "morning batch"))
                .thenReturn(99L);
        when(rawMaterialRepository.consumeStock(11, new BigDecimal("4"))).thenReturn(1);
        when(repository.updateStock(8, new BigDecimal("4"), new BigDecimal("7.7500")))
                .thenReturn(1);

        var result = service.produce(
                8,
                new BigDecimal("2"),
                LocalDate.of(2026, 10, 5),
                "  morning batch  ");

        assertThat(result).isSameAs(after);
        verify(rawMaterialRepository).insertStockMovement(
                11,
                "PRODUCTION_CONSUMPTION",
                new BigDecimal("4"),
                new BigDecimal("2.0000"),
                new BigDecimal("8.0000"),
                LocalDate.of(2026, 10, 5),
                "Production of 2 × Bouquet (batch #99)");
        verify(repository).insertProductionConsumption(
                99,
                11,
                new BigDecimal("4"),
                new BigDecimal("2.0000"),
                new BigDecimal("8.0000"));
        verify(repository).insertStockMovement(
                8,
                99L,
                null,
                "PRODUCTION",
                new BigDecimal("2"),
                new BigDecimal("5.5000"),
                new BigDecimal("11.0000"),
                LocalDate.of(2026, 10, 5),
                "morning batch");
    }

    @Test
    void rejectsFractionalProductWriteOffsBeforeReadingStock() {
        assertThatThrownBy(() -> service.writeOffStock(
                        8,
                        new BigDecimal("1.5"),
                        LocalDate.of(2026, 10, 5),
                        "Damaged",
                        null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Write-off quantity must be a whole number");

        verifyNoInteractions(repository);
    }

    @Test
    void refusesToDeleteProductsThatHaveSales() {
        when(repository.findById(8))
                .thenReturn(Optional.of(product(8, "BOUQUET", "Bouquet", "0", "0", recipeDto())));
        when(repository.hasSales(8)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(8))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("has been sold");

        verify(repository, never()).delete(8);
    }

    private RawMaterialDto material(
            long id, String name, String quantity, String averageUnitCost) {
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
                false,
                "created",
                "updated");
    }

    private ProductDto product(
            long id,
            String sku,
            String name,
            String quantity,
            String averageUnitCost,
            List<ProductRecipeItemDto> recipe) {
        var stockQuantity = new BigDecimal(quantity);
        var unitCost = new BigDecimal(averageUnitCost);
        return new ProductDto(
                id,
                sku,
                name,
                "",
                stockQuantity,
                new BigDecimal("25.00"),
                new BigDecimal("1.50"),
                new BigDecimal("8.75"),
                unitCost,
                stockQuantity.multiply(unitCost),
                recipe,
                false,
                "created",
                "updated");
    }

    private List<ProductRecipeItemDto> recipeDto() {
        return List.of(new ProductRecipeItemDto(
                11,
                "Rose",
                "PIECE",
                new BigDecimal("2"),
                new BigDecimal("100"),
                new BigDecimal("2.0000")));
    }
}
