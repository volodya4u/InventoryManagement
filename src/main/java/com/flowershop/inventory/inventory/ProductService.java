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
public class ProductService {

    private final ProductRepository repository;
    private final ImageValidator imageValidator;

    public ProductService(ProductRepository repository, ImageValidator imageValidator) {
        this.repository = repository;
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
            BigDecimal quantity,
            BigDecimal price,
            MultipartFile image) {
        long id = repository.insert(
                sku.trim(),
                name.trim(),
                normalizeDescription(description),
                quantity,
                price,
                imageValidator.validate(image));
        return findById(id);
    }

    @Transactional
    public ProductDto update(
            long id,
            String sku,
            String name,
            String description,
            BigDecimal quantity,
            BigDecimal price,
            MultipartFile image) {
        int changed = repository.update(
                id,
                sku.trim(),
                name.trim(),
                normalizeDescription(description),
                quantity,
                price,
                imageValidator.validate(image));
        if (changed == 0) {
            throw notFound(id);
        }
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

    private String normalizeDescription(String description) {
        return description == null ? "" : description.trim();
    }

    private NotFoundException notFound(long id) {
        return new NotFoundException("Product with id " + id + " not found");
    }
}
