package com.flowershop.inventory.inventory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Validated
@RestController
@RequestMapping("/api/raw-materials")
public class RawMaterialController {

    private final RawMaterialService service;

    public RawMaterialController(RawMaterialService service) {
        this.service = service;
    }

    @GetMapping
    public List<RawMaterialDto> findAll() {
        return service.findAll();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public RawMaterialDto create(
            @RequestParam @NotBlank @Size(max = 120) String name,
            @RequestParam(defaultValue = "") @Size(max = 1000) String description,
            @RequestParam @NotBlank String unit,
            @RequestParam @DecimalMin("0.0") BigDecimal quantity,
            @RequestParam(required = false) @DecimalMin("0.0") BigDecimal initialUnitCost,
            @RequestParam(required = false) MultipartFile image) {
        return service.create(name, description, unit, quantity, initialUnitCost, image);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public RawMaterialDto update(
            @PathVariable long id,
            @RequestParam @NotBlank @Size(max = 120) String name,
            @RequestParam(defaultValue = "") @Size(max = 1000) String description,
            @RequestParam @NotBlank String unit,
            @RequestParam(required = false) MultipartFile image) {
        return service.update(id, name, description, unit, image);
    }

    @PostMapping("/{id}/receipts")
    public RawMaterialDto receiveStock(
            @PathVariable long id,
            @Valid @RequestBody StockReceiptRequest request) {
        return service.receiveStock(
                id,
                request.receivedQuantity(),
                request.unitPurchaseCost(),
                request.receiptDate(),
                request.notes());
    }

    @PostMapping("/{id}/write-offs")
    public RawMaterialDto writeOffStock(
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
    public RawMaterialDto adjustStock(
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

    public record StockReceiptRequest(
            @NotNull @DecimalMin(value = "0.0", inclusive = false) BigDecimal receivedQuantity,
            @NotNull @DecimalMin("0.0") BigDecimal unitPurchaseCost,
            @NotNull LocalDate receiptDate,
            @Size(max = 1000) String notes) {
    }
}
