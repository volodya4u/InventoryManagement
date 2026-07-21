package com.flowershop.inventory.inventory;

import com.flowershop.inventory.sales.SaleRepository;
import java.math.BigDecimal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final RawMaterialRepository rawMaterialRepository;
    private final ProductRepository productRepository;
    private final SaleRepository saleRepository;

    public DashboardController(
            RawMaterialRepository rawMaterialRepository,
            ProductRepository productRepository,
            SaleRepository saleRepository) {
        this.rawMaterialRepository = rawMaterialRepository;
        this.productRepository = productRepository;
        this.saleRepository = saleRepository;
    }

    @GetMapping
    public DashboardSummary summary() {
        return new DashboardSummary(
                rawMaterialRepository.count(),
                productRepository.count(),
                productRepository.totalQuantity(),
                saleRepository.count());
    }

    public record DashboardSummary(
            long rawMaterialTypes,
            long productTypes,
            BigDecimal productUnits,
            long salesCount) {
    }
}
