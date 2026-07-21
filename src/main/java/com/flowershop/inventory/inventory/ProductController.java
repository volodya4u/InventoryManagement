package com.flowershop.inventory.inventory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Validated
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping
    public List<ProductDto> findAll() {
        return service.findAll();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ProductDto create(
            @RequestParam @NotBlank @Size(max = 60) String sku,
            @RequestParam @NotBlank @Size(max = 120) String name,
            @RequestParam(defaultValue = "") @Size(max = 1000) String description,
            @RequestParam @DecimalMin("0.0") @Digits(integer = 12, fraction = 0) BigDecimal quantity,
            @RequestParam(required = false) @DecimalMin("0.0") BigDecimal initialUnitCost,
            @RequestParam(defaultValue = "0") @DecimalMin("0.0") @Digits(integer = 12, fraction = 2)
            BigDecimal advertisingCostPerUnit,
            @RequestParam @NotNull @DecimalMin("0.0") @Digits(integer = 6, fraction = 2)
            BigDecimal markupPercentage,
            @RequestPart("recipe") @Size(min = 1) List<@Valid ProductRecipeItemInput> recipe,
            @RequestParam(required = false) MultipartFile image) {
        return service.create(
                sku, name, description, quantity, initialUnitCost, advertisingCostPerUnit,
                markupPercentage, recipe, image);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductDto update(
            @PathVariable long id,
            @RequestParam @NotBlank @Size(max = 60) String sku,
            @RequestParam @NotBlank @Size(max = 120) String name,
            @RequestParam(defaultValue = "") @Size(max = 1000) String description,
            @RequestParam(defaultValue = "0") @DecimalMin("0.0") @Digits(integer = 12, fraction = 2)
            BigDecimal advertisingCostPerUnit,
            @RequestParam @NotNull @DecimalMin("0.0") @Digits(integer = 6, fraction = 2)
            BigDecimal markupPercentage,
            @RequestPart("recipe") @Size(min = 1) List<@Valid ProductRecipeItemInput> recipe,
            @RequestParam(required = false) MultipartFile image) {
        return service.update(
                id, sku, name, description, advertisingCostPerUnit, markupPercentage, recipe, image);
    }

    @PostMapping("/{id}/production")
    public ProductDto produce(
            @PathVariable long id,
            @Valid @RequestBody ProductionRequest request) {
        return service.produce(id, request.quantity(), request.productionDate(), request.notes());
    }

    @PostMapping("/{id}/write-offs")
    public ProductDto writeOffStock(
            @PathVariable long id,
            @Valid @RequestBody StockWriteOffRequest request) {
        return service.writeOffStock(
                id,
                request.quantity(),
                request.operationDate(),
                request.reason(),
                request.notes());
    }

    @PostMapping("/{id}/adjustments")
    public ProductDto adjustStock(
            @PathVariable long id,
            @Valid @RequestBody StockAdjustmentRequest request) {
        return service.adjustStock(
                id,
                request.actualQuantity(),
                request.operationDate(),
                request.reason(),
                request.notes());
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable long id) {
        var image = service.findImage(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .cacheControl(CacheControl.noStore())
                .body(image.bytes());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    public record ProductionRequest(
            @NotNull @DecimalMin(value = "0.0", inclusive = false)
            @Digits(integer = 12, fraction = 0) BigDecimal quantity,
            @NotNull LocalDate productionDate,
            @Size(max = 1000) String notes) {
    }
}
