package com.flowershop.inventory.inventory;

import com.flowershop.inventory.common.NotFoundException;
import com.flowershop.inventory.image.ImageValidator;
import com.flowershop.inventory.image.StoredImage;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class RawMaterialService {

    private static final int UNIT_COST_SCALE = 4;

    private final RawMaterialRepository repository;
    private final ImageValidator imageValidator;

    public RawMaterialService(RawMaterialRepository repository, ImageValidator imageValidator) {
        this.repository = repository;
        this.imageValidator = imageValidator;
    }

    public List<RawMaterialDto> findAll() {
        return repository.findAll();
    }

    @Transactional
    public RawMaterialDto create(
            String name,
            String description,
            String unit,
            BigDecimal quantity,
            BigDecimal initialUnitCost,
            MultipartFile image) {
        var normalizedUnitCost = normalizeInitialUnitCost(quantity, initialUnitCost);
        long id = repository.insert(
                name.trim(),
                normalizeDescription(description),
                MeasurementUnit.from(unit),
                quantity,
                normalizedUnitCost,
                imageValidator.validate(image));
        if (quantity.signum() > 0) {
            repository.insertStockMovement(
                    id,
                    "OPENING_BALANCE",
                    quantity,
                    normalizedUnitCost,
                    quantity.multiply(normalizedUnitCost),
                    LocalDate.now(),
                    "Initial stock");
        }
        return findById(id);
    }

    @Transactional
    public RawMaterialDto update(
            long id,
            String name,
            String description,
            String unit,
            MultipartFile image) {
        int changed = repository.update(
                id,
                name.trim(),
                normalizeDescription(description),
                MeasurementUnit.from(unit),
                imageValidator.validate(image));
        if (changed == 0) {
            throw notFound(id);
        }
        return findById(id);
    }

    @Transactional
    public RawMaterialDto receiveStock(
            long id,
            BigDecimal receivedQuantity,
            BigDecimal unitPurchaseCost,
            LocalDate receiptDate,
            String notes) {
        var material = findById(id);
        var normalizedCost = unitPurchaseCost.setScale(UNIT_COST_SCALE, RoundingMode.HALF_UP);
        var newQuantity = material.quantity().add(receivedQuantity);
        var currentValue = material.quantity().multiply(material.averageUnitCost());
        var receiptValue = receivedQuantity.multiply(normalizedCost);
        var newAverageUnitCost = currentValue.add(receiptValue)
                .divide(newQuantity, UNIT_COST_SCALE, RoundingMode.HALF_UP);

        if (repository.updateStock(id, newQuantity, newAverageUnitCost) == 0) {
            throw notFound(id);
        }
        repository.insertStockMovement(
                id,
                "RECEIPT",
                receivedQuantity,
                normalizedCost,
                receiptValue,
                receiptDate,
                normalizeDescription(notes));
        return findById(id);
    }

    public RawMaterialDto findById(long id) {
        return repository.findById(id).orElseThrow(() -> notFound(id));
    }

    public StoredImage findImage(long id) {
        return repository.findImage(id)
                .orElseThrow(() -> new NotFoundException("Raw material image not found"));
    }

    @Transactional
    public void delete(long id) {
        if (repository.delete(id) == 0) {
            throw notFound(id);
        }
    }

    private String normalizeDescription(String description) {
        return description == null ? "" : description.trim();
    }

    private BigDecimal normalizeInitialUnitCost(BigDecimal quantity, BigDecimal initialUnitCost) {
        if (quantity.signum() > 0 && initialUnitCost == null) {
            throw new IllegalArgumentException(
                    "Initial unit cost is required when initial stock is greater than zero");
        }
        var cost = initialUnitCost == null ? BigDecimal.ZERO : initialUnitCost;
        return cost.setScale(UNIT_COST_SCALE, RoundingMode.HALF_UP);
    }

    private NotFoundException notFound(long id) {
        return new NotFoundException("Raw material with id " + id + " not found");
    }
}
