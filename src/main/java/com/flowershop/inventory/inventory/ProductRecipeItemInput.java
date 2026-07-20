package com.flowershop.inventory.inventory;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;

public record ProductRecipeItemInput(
        @NotNull @Positive Long rawMaterialId,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) BigDecimal quantityPerUnit) {
}
