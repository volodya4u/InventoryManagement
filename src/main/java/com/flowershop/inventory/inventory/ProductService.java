package com.flowershop.inventory.inventory;

import com.flowershop.inventory.common.InsufficientStockException;
import com.flowershop.inventory.common.InsufficientStockException.StockShortage;
import com.flowershop.inventory.common.NotFoundException;
import com.flowershop.inventory.image.ImageValidator;
import com.flowershop.inventory.image.StoredImage;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProductService {

    private static final int UNIT_COST_SCALE = 4;
    private static final int PRICE_SCALE = 2;
    private static final int MARKUP_SCALE = 2;
    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");

    private final ProductRepository repository;
    private final RawMaterialRepository rawMaterialRepository;
    private final ImageValidator imageValidator;

    public ProductService(
            ProductRepository repository,
            RawMaterialRepository rawMaterialRepository,
            ImageValidator imageValidator) {
        this.repository = repository;
        this.rawMaterialRepository = rawMaterialRepository;
        this.imageValidator = imageValidator;
    }

    public List<ProductDto> findAll() {
        return repository.findAll();
    }

    @Transactional
    public ProductDto create(
            String sku,
            String name,
            String description,
            BigDecimal initialQuantity,
            BigDecimal initialUnitCost,
            BigDecimal markupPercentage,
            List<ProductRecipeItemInput> recipe,
            MultipartFile image) {
        var validatedRecipe = validateRecipe(recipe);
        var normalizedInitialCost = normalizeInitialUnitCost(initialQuantity, initialUnitCost);
        var normalizedMarkup = normalizeMarkup(markupPercentage);
        var sellingPrice = calculateSellingPrice(validatedRecipe, normalizedMarkup);
        long id = repository.insert(
                sku.trim(),
                name.trim(),
                normalizeDescription(description),
                initialQuantity,
                normalizedMarkup,
                sellingPrice,
                normalizedInitialCost,
                imageValidator.validate(image));
        repository.replaceRecipe(id, validatedRecipe);
        if (initialQuantity.signum() > 0) {
            repository.insertStockMovement(
                    id,
                    null,
                    null,
                    "OPENING_BALANCE",
                    initialQuantity,
                    normalizedInitialCost,
                    initialQuantity.multiply(normalizedInitialCost),
                    LocalDate.now(),
                    "Initial product stock");
        }
        return findById(id);
    }

    @Transactional
    public ProductDto update(
            long id,
            String sku,
            String name,
            String description,
            BigDecimal markupPercentage,
            List<ProductRecipeItemInput> recipe,
            MultipartFile image) {
        var validatedRecipe = validateRecipe(recipe);
        var normalizedMarkup = normalizeMarkup(markupPercentage);
        var sellingPrice = calculateSellingPrice(validatedRecipe, normalizedMarkup);
        int changed = repository.update(
                id,
                sku.trim(),
                name.trim(),
                normalizeDescription(description),
                normalizedMarkup,
                sellingPrice,
                imageValidator.validate(image));
        if (changed == 0) {
            throw notFound(id);
        }
        repository.replaceRecipe(id, validatedRecipe);
        return findById(id);
    }

    @Transactional
    public ProductDto produce(
            long id,
            BigDecimal producedQuantity,
            LocalDate productionDate,
            String notes) {
        var product = findById(id);
        if (product.recipe().isEmpty()) {
            throw new IllegalArgumentException("Add at least one raw material to the product recipe");
        }

        var requirements = new ArrayList<ProductionRequirement>();
        var shortages = new ArrayList<StockShortage>();
        var totalProductionCost = BigDecimal.ZERO;

        for (var recipeItem : product.recipe()) {
            var material = rawMaterialRepository.findById(recipeItem.rawMaterialId())
                    .orElseThrow(() -> new NotFoundException(
                            "Raw material with id " + recipeItem.rawMaterialId() + " not found"));
            var requiredQuantity = recipeItem.quantityPerUnit().multiply(producedQuantity);
            if (material.quantity().compareTo(requiredQuantity) < 0) {
                shortages.add(shortage(material, requiredQuantity));
            }
            var requiredCost = requiredQuantity.multiply(material.averageUnitCost());
            totalProductionCost = totalProductionCost.add(requiredCost);
            requirements.add(new ProductionRequirement(material, requiredQuantity, requiredCost));
        }

        if (!shortages.isEmpty()) {
            throw new InsufficientStockException(shortages);
        }

        var productionUnitCost = totalProductionCost
                .divide(producedQuantity, UNIT_COST_SCALE, RoundingMode.HALF_UP);
        var normalizedNotes = normalizeDescription(notes);
        long batchId = repository.insertProductionBatch(
                id,
                producedQuantity,
                productionUnitCost,
                totalProductionCost,
                productionDate,
                normalizedNotes);

        for (var requirement : requirements) {
            if (rawMaterialRepository.consumeStock(
                    requirement.material().id(), requirement.requiredQuantity()) == 0) {
                var current = rawMaterialRepository.findById(requirement.material().id())
                        .orElseThrow(() -> new NotFoundException(
                                "Raw material with id " + requirement.material().id() + " not found"));
                throw new InsufficientStockException(List.of(shortage(current, requirement.requiredQuantity())));
            }
            var movementNotes = "Production of %s × %s (batch #%d)"
                    .formatted(producedQuantity.stripTrailingZeros().toPlainString(), product.name(), batchId);
            rawMaterialRepository.insertStockMovement(
                    requirement.material().id(),
                    "PRODUCTION_CONSUMPTION",
                    requirement.requiredQuantity(),
                    requirement.material().averageUnitCost(),
                    requirement.requiredCost(),
                    productionDate,
                    movementNotes);
            repository.insertProductionConsumption(
                    batchId,
                    requirement.material().id(),
                    requirement.requiredQuantity(),
                    requirement.material().averageUnitCost(),
                    requirement.requiredCost());
        }

        var newQuantity = product.quantity().add(producedQuantity);
        var currentStockValue = product.quantity().multiply(product.averageUnitCost());
        var newAverageUnitCost = currentStockValue.add(totalProductionCost)
                .divide(newQuantity, UNIT_COST_SCALE, RoundingMode.HALF_UP);
        if (repository.updateStock(id, newQuantity, newAverageUnitCost) == 0) {
            throw notFound(id);
        }
        repository.insertStockMovement(
                id,
                batchId,
                null,
                "PRODUCTION",
                producedQuantity,
                productionUnitCost,
                totalProductionCost,
                productionDate,
                normalizedNotes);
        return findById(id);
    }

    public ProductDto findById(long id) {
        return repository.findById(id).orElseThrow(() -> notFound(id));
    }

    public StoredImage findImage(long id) {
        return repository.findImage(id)
                .orElseThrow(() -> new NotFoundException("Product image not found"));
    }

    @Transactional
    public void delete(long id) {
        if (repository.delete(id) == 0) {
            throw notFound(id);
        }
    }

    private List<ProductRecipeItemInput> validateRecipe(List<ProductRecipeItemInput> recipe) {
        if (recipe == null || recipe.isEmpty()) {
            throw new IllegalArgumentException("Add at least one raw material to the product recipe");
        }
        var rawMaterialIds = new HashSet<Long>();
        for (var item : recipe) {
            if (item == null || item.rawMaterialId() == null || item.quantityPerUnit() == null
                    || item.quantityPerUnit().signum() <= 0) {
                throw new IllegalArgumentException("Every recipe item must have a material and positive quantity");
            }
            if (!rawMaterialIds.add(item.rawMaterialId())) {
                throw new IllegalArgumentException("Each raw material can appear only once in a product recipe");
            }
            rawMaterialRepository.findById(item.rawMaterialId())
                    .orElseThrow(() -> new NotFoundException(
                            "Raw material with id " + item.rawMaterialId() + " not found"));
        }
        return List.copyOf(recipe);
    }

    private BigDecimal normalizeInitialUnitCost(BigDecimal quantity, BigDecimal initialUnitCost) {
        if (quantity.signum() > 0 && initialUnitCost == null) {
            throw new IllegalArgumentException(
                    "Initial unit cost is required when initial stock is greater than zero");
        }
        var cost = initialUnitCost == null ? BigDecimal.ZERO : initialUnitCost;
        return cost.setScale(UNIT_COST_SCALE, RoundingMode.HALF_UP);
    }

    private BigDecimal normalizeMarkup(BigDecimal markupPercentage) {
        if (markupPercentage == null || markupPercentage.signum() < 0) {
            throw new IllegalArgumentException("Markup percentage cannot be negative");
        }
        return markupPercentage.setScale(MARKUP_SCALE, RoundingMode.HALF_UP);
    }

    private BigDecimal calculateSellingPrice(
            List<ProductRecipeItemInput> recipe,
            BigDecimal markupPercentage) {
        var recipeUnitCost = recipe.stream()
                .map(item -> {
                    var material = rawMaterialRepository.findById(item.rawMaterialId())
                            .orElseThrow(() -> new NotFoundException(
                                    "Raw material with id " + item.rawMaterialId() + " not found"));
                    return item.quantityPerUnit().multiply(material.averageUnitCost());
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var multiplier = BigDecimal.ONE.add(markupPercentage.divide(ONE_HUNDRED));
        return recipeUnitCost.multiply(multiplier).setScale(PRICE_SCALE, RoundingMode.HALF_UP);
    }

    private StockShortage shortage(RawMaterialDto material, BigDecimal requiredQuantity) {
        return new StockShortage(
                material.id(),
                material.name(),
                material.unit(),
                requiredQuantity,
                material.quantity(),
                requiredQuantity.subtract(material.quantity()).max(BigDecimal.ZERO));
    }

    private String normalizeDescription(String value) {
        return value == null ? "" : value.trim();
    }

    private NotFoundException notFound(long id) {
        return new NotFoundException("Product with id " + id + " not found");
    }

    private record ProductionRequirement(
            RawMaterialDto material,
            BigDecimal requiredQuantity,
            BigDecimal requiredCost) {
    }
}
