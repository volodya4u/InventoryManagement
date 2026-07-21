package com.flowershop.inventory.sales;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sales")
public class SaleController {

    private final SaleService service;

    public SaleController(SaleService service) {
        this.service = service;
    }

    @GetMapping
    public List<SaleDto> findAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public SaleDto findById(@PathVariable long id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SaleDto create(@Valid @RequestBody CreateSaleRequest request) {
        return service.create(request);
    }

    @PostMapping("/{id}/returns")
    public SaleDto returnProducts(
            @PathVariable long id,
            @Valid @RequestBody CreateSaleReturnRequest request) {
        return service.returnProducts(id, request);
    }

    @PostMapping("/{id}/cancellation")
    public SaleDto cancel(
            @PathVariable long id,
            @Valid @RequestBody CancelSaleRequest request) {
        return service.cancel(id, request);
    }
}
