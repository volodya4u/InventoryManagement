package com.flowershop.inventory.sales;

import com.flowershop.inventory.common.InsufficientProductStockException;
import com.flowershop.inventory.common.InsufficientProductStockException.ProductShortage;
import com.flowershop.inventory.common.NotFoundException;
import com.flowershop.inventory.inventory.ProductDto;
import com.flowershop.inventory.inventory.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SaleService {

    private static final int MONEY_SCALE = 2;

    private final SaleRepository repository;
    private final ProductRepository productRepository;

    public SaleService(SaleRepository repository, ProductRepository productRepository) {
        this.repository = repository;
        this.productRepository = productRepository;
    }

    public List<SaleDto> findAll() {
        return repository.findAll();
    }

    public SaleDto findById(long id) {
        return repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Sale with id " + id + " not found"));
    }

    @Transactional
    public SaleDto create(CreateSaleRequest request) {
        if (request == null || request.saleDate() == null || request.paymentMethod() == null
                || request.items() == null || request.items().isEmpty()) {
            throw new IllegalArgumentException("A sale date, payment method, and at least one product are required");
        }

        var productIds = new HashSet<Long>();
        var preparedItems = new ArrayList<PreparedSaleItem>();
        var shortages = new ArrayList<ProductShortage>();
        var totalRevenue = BigDecimal.ZERO;
        var totalCost = BigDecimal.ZERO;

        for (var input : request.items()) {
            validateInput(input, productIds);
            var product = productRepository.findById(input.productId())
                    .orElseThrow(() -> new NotFoundException(
                            "Product with id " + input.productId() + " not found"));
            if (product.quantity().compareTo(input.quantity()) < 0) {
                shortages.add(shortage(product, input.quantity()));
            }

            var unitPrice = money(input.unitPrice());
            var unitCost = product.averageUnitCost();
            var lineRevenue = money(input.quantity().multiply(unitPrice));
            var lineCost = money(input.quantity().multiply(unitCost));
            totalRevenue = totalRevenue.add(lineRevenue);
            totalCost = totalCost.add(lineCost);
            preparedItems.add(new PreparedSaleItem(
                    product,
                    input.quantity(),
                    unitPrice,
                    lineRevenue,
                    lineCost));
        }

        if (!shortages.isEmpty()) {
            throw new InsufficientProductStockException(shortages);
        }

        totalRevenue = money(totalRevenue);
        totalCost = money(totalCost);
        var grossProfit = money(totalRevenue.subtract(totalCost));
        var saleNumber = repository.nextSaleNumber(request.saleDate());
        var notes = request.notes() == null ? "" : request.notes().trim();
        long saleId = repository.insert(
                saleNumber,
                request.saleDate(),
                request.paymentMethod(),
                notes,
                totalRevenue,
                totalCost,
                grossProfit);

        for (var prepared : preparedItems) {
            if (productRepository.consumeStock(prepared.product().id(), prepared.quantity()) == 0) {
                var current = productRepository.findById(prepared.product().id())
                        .orElseThrow(() -> new NotFoundException(
                                "Product with id " + prepared.product().id() + " not found"));
                throw new InsufficientProductStockException(List.of(shortage(current, prepared.quantity())));
            }
            var item = new SaleItemDto(
                    prepared.product().id(),
                    prepared.product().sku(),
                    prepared.product().name(),
                    prepared.quantity(),
                    money(prepared.product().sellingPrice()),
                    prepared.unitPrice(),
                    prepared.product().averageUnitCost(),
                    prepared.lineRevenue(),
                    prepared.lineCost(),
                    money(prepared.lineRevenue().subtract(prepared.lineCost())));
            repository.insertItem(saleId, item);
            productRepository.insertStockMovement(
                    prepared.product().id(),
                    null,
                    saleId,
                    "SALE",
                    prepared.quantity(),
                    prepared.product().averageUnitCost(),
                    prepared.lineCost(),
                    request.saleDate(),
                    "Sale " + saleNumber);
        }

        return findById(saleId);
    }

    private void validateInput(SaleItemInput input, HashSet<Long> productIds) {
        if (input == null || input.productId() == null || input.quantity() == null
                || input.unitPrice() == null || input.quantity().signum() <= 0
                || input.unitPrice().signum() < 0
                || input.quantity().stripTrailingZeros().scale() > 0) {
            throw new IllegalArgumentException(
                    "Every sale item must have a product, a positive whole quantity, and a non-negative price");
        }
        if (!productIds.add(input.productId())) {
            throw new IllegalArgumentException("Each product can appear only once in a sale");
        }
    }

    private ProductShortage shortage(ProductDto product, BigDecimal requiredQuantity) {
        return new ProductShortage(
                product.id(),
                product.sku(),
                product.name(),
                requiredQuantity,
                product.quantity(),
                requiredQuantity.subtract(product.quantity()).max(BigDecimal.ZERO));
    }

    private BigDecimal money(BigDecimal value) {
        return value.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private record PreparedSaleItem(
            ProductDto product,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal lineRevenue,
            BigDecimal lineCost) {
    }
}
