package com.flowershop.inventory.inventory;

import java.math.BigDecimal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final RawMaterialRepository rawMaterialRepository;
    private final ProductRepository productRepository;

    public DashboardController(
            RawMaterialRepository rawMaterialRepository,
            ProductRepository productRepository) {
        this.rawMaterialRepository = rawMaterialRepository;
        this.productRepository = productRepository;
    }

    @GetMapping
    public DashboardSummary summary() {
        return new DashboardSummary(
                rawMaterialRepository.count(),
                productRepository.count(),
                productRepository.totalQuantity(),
                0L);
    }

    public record DashboardSummary(
            long rawMaterialTypes,
            long productTypes,
            BigDecimal productUnits,
            long salesCount) {
    }
}
