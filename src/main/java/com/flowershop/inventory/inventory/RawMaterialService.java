package com.flowershop.inventory.inventory;

import com.flowershop.inventory.common.NotFoundException;
import com.flowershop.inventory.image.ImageValidator;
import com.flowershop.inventory.image.StoredImage;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class RawMaterialService {

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
            MultipartFile image) {
        long id = repository.insert(
                name.trim(),
                normalizeDescription(description),
                MeasurementUnit.from(unit),
                quantity,
                imageValidator.validate(image));
        return findById(id);
    }

    @Transactional
    public RawMaterialDto update(
            long id,
            String name,
            String description,
            String unit,
            BigDecimal quantity,
            MultipartFile image) {
        int changed = repository.update(
                id,
                name.trim(),
                normalizeDescription(description),
                MeasurementUnit.from(unit),
                quantity,
                imageValidator.validate(image));
        if (changed == 0) {
            throw notFound(id);
        }
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

    private NotFoundException notFound(long id) {
        return new NotFoundException("Raw material with id " + id + " not found");
    }
}
