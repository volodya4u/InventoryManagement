package com.flowershop.inventory.inventory;

import com.flowershop.inventory.common.InsufficientStockException;
import com.flowershop.inventory.common.InsufficientStockException.StockShortage;
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

    @Transactional
    public RawMaterialDto writeOffStock(
            long id,
            BigDecimal quantity,
            LocalDate operationDate,
            String reason,
            String notes) {
        var material = findById(id);
        if (material.quantity().compareTo(quantity) < 0) {
            throw insufficientStock(material, quantity);
        }
        if (repository.consumeStock(id, quantity) == 0) {
            var current = findById(id);
            throw insufficientStock(current, quantity);
        }
        repository.insertStockMovement(
                id,
                "WRITE_OFF",
                quantity,
                material.averageUnitCost(),
                quantity.multiply(material.averageUnitCost()),
                operationDate,
                operationNotes(reason, notes));
        return findById(id);
    }

    @Transactional
    public RawMaterialDto adjustStock(
            long id,
            BigDecimal actualQuantity,
            LocalDate operationDate,
            String reason,
            String notes) {
        var material = findById(id);
        var difference = actualQuantity.subtract(material.quantity());
        if (difference.signum() == 0) {
            throw new IllegalArgumentException("Actual stock already matches the recorded raw material stock");
        }
        if (repository.updateStock(id, actualQuantity, material.averageUnitCost()) == 0) {
            throw notFound(id);
        }
        var movementQuantity = difference.abs();
        repository.insertStockMovement(
                id,
                difference.signum() > 0 ? "ADJUSTMENT_INCREASE" : "ADJUSTMENT_DECREASE",
                movementQuantity,
                material.averageUnitCost(),
                movementQuantity.multiply(material.averageUnitCost()),
                operationDate,
                operationNotes(reason, notes));
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

    private String operationNotes(String reason, String notes) {
        var normalizedReason = reason.trim();
        var normalizedNotes = normalizeDescription(notes);
        return normalizedNotes.isEmpty()
                ? "Reason: " + normalizedReason
                : "Reason: " + normalizedReason + ". " + normalizedNotes;
    }

    private InsufficientStockException insufficientStock(
            RawMaterialDto material,
            BigDecimal requiredQuantity) {
        return new InsufficientStockException(List.of(new StockShortage(
                material.id(),
                material.name(),
                material.unit(),
                requiredQuantity,
                material.quantity(),
                requiredQuantity.subtract(material.quantity()).max(BigDecimal.ZERO))));
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
