package com.flowershop.inventory.sales;

import com.flowershop.inventory.common.InsufficientProductStockException;
import com.flowershop.inventory.common.InsufficientProductStockException.ProductShortage;
import com.flowershop.inventory.common.NotFoundException;
import com.flowershop.inventory.inventory.ProductDto;
import com.flowershop.inventory.inventory.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SaleService {

    private static final int MONEY_SCALE = 2;
    private static final int UNIT_COST_SCALE = 4;

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
                    0,
                    prepared.product().id(),
                    prepared.product().sku(),
                    prepared.product().name(),
                    prepared.quantity(),
                    money(prepared.product().sellingPrice()),
                    prepared.unitPrice(),
                    prepared.product().averageUnitCost(),
                    prepared.lineRevenue(),
                    prepared.lineCost(),
                    money(prepared.lineRevenue().subtract(prepared.lineCost())),
                    BigDecimal.ZERO);
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

    @Transactional
    public SaleDto returnProducts(long saleId, CreateSaleReturnRequest request) {
        var sale = findById(saleId);
        if (sale.status() == SaleStatus.CANCELLED) {
            throw new IllegalArgumentException("A cancelled sale cannot receive Product returns");
        }
        if (sale.status() == SaleStatus.RETURNED) {
            throw new IllegalArgumentException("All Products from this sale have already been returned");
        }
        validateOperationDate(sale, request.returnDate(), "Return date");

        var itemsById = new HashMap<Long, SaleItemDto>();
        sale.items().forEach(item -> itemsById.put(item.id(), item));
        var requestedItemIds = new HashSet<Long>();
        var preparedItems = new ArrayList<PreparedReturnItem>();
        var totalRemainingBeforeReturn = BigDecimal.ZERO;
        for (var item : sale.items()) {
            totalRemainingBeforeReturn = totalRemainingBeforeReturn.add(
                    item.quantity().subtract(item.returnedQuantity()));
        }

        for (var input : request.items()) {
            validateReturnInput(input, requestedItemIds);
            var item = itemsById.get(input.saleItemId());
            if (item == null) {
                throw new IllegalArgumentException(
                        "Sale item with id " + input.saleItemId() + " does not belong to this sale");
            }
            var remaining = item.quantity().subtract(item.returnedQuantity());
            if (input.quantity().compareTo(remaining) > 0) {
                throw new IllegalArgumentException(
                        "Return quantity for " + item.productName()
                                + " exceeds the remaining returnable quantity "
                                + remaining.stripTrailingZeros().toPlainString());
            }
            preparedItems.add(prepareReturnItem(item, input.quantity()));
        }

        var returnedNow = preparedItems.stream()
                .map(PreparedReturnItem::quantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var resultingStatus = returnedNow.compareTo(totalRemainingBeforeReturn) == 0
                ? SaleStatus.RETURNED
                : SaleStatus.PARTIALLY_RETURNED;
        return completeReversal(
                sale,
                request.returnDate(),
                SaleReturnType.RETURN,
                request.reason(),
                request.notes(),
                preparedItems,
                resultingStatus);
    }

    @Transactional
    public SaleDto cancel(long saleId, CancelSaleRequest request) {
        var sale = findById(saleId);
        if (sale.status() != SaleStatus.COMPLETED) {
            throw new IllegalArgumentException(
                    "Only a completed sale without previous returns can be cancelled");
        }
        validateOperationDate(sale, request.cancellationDate(), "Cancellation date");
        var items = sale.items().stream()
                .map(item -> prepareReturnItem(item, item.quantity()))
                .toList();
        return completeReversal(
                sale,
                request.cancellationDate(),
                SaleReturnType.CANCELLATION,
                request.reason(),
                request.notes(),
                items,
                SaleStatus.CANCELLED);
    }

    private SaleDto completeReversal(
            SaleDto sale,
            LocalDate operationDate,
            SaleReturnType operationType,
            String reason,
            String notes,
            List<PreparedReturnItem> preparedItems,
            SaleStatus resultingStatus) {
        var totalRefund = money(preparedItems.stream()
                .map(PreparedReturnItem::lineRefund)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        var totalCost = money(preparedItems.stream()
                .map(PreparedReturnItem::lineCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        var grossProfitReversal = money(totalRefund.subtract(totalCost));
        var returnNumber = repository.nextReturnNumber(operationDate);
        var normalizedReason = reason.trim();
        var normalizedNotes = notes == null ? "" : notes.trim();
        long returnId = repository.insertReturn(
                sale.id(),
                returnNumber,
                operationDate,
                operationType,
                normalizedReason,
                normalizedNotes,
                totalRefund,
                totalCost,
                grossProfitReversal);

        for (var prepared : preparedItems) {
            restoreProductStock(
                    prepared.item().productId(),
                    prepared.quantity(),
                    prepared.item().unitCost());
            var returnItem = new SaleReturnItemDto(
                    prepared.item().id(),
                    prepared.item().productId(),
                    prepared.item().productSku(),
                    prepared.item().productName(),
                    prepared.quantity(),
                    prepared.item().unitPrice(),
                    prepared.item().unitCost(),
                    prepared.lineRefund(),
                    prepared.lineCost(),
                    money(prepared.lineRefund().subtract(prepared.lineCost())));
            repository.insertReturnItem(returnId, returnItem);
            productRepository.insertSaleReversalStockMovement(
                    prepared.item().productId(),
                    sale.id(),
                    returnId,
                    operationType == SaleReturnType.CANCELLATION
                            ? "SALE_CANCELLATION"
                            : "SALE_RETURN",
                    prepared.quantity(),
                    prepared.item().unitCost(),
                    prepared.lineCost(),
                    operationDate,
                    (operationType == SaleReturnType.CANCELLATION ? "Cancellation " : "Return ")
                            + returnNumber + " for " + sale.saleNumber());
        }

        repository.updateStatus(sale.id(), resultingStatus);
        return findById(sale.id());
    }

    private PreparedReturnItem prepareReturnItem(SaleItemDto item, BigDecimal quantity) {
        return new PreparedReturnItem(
                item,
                quantity,
                money(quantity.multiply(item.unitPrice())),
                money(quantity.multiply(item.unitCost())));
    }

    private void restoreProductStock(long productId, BigDecimal quantity, BigDecimal returnUnitCost) {
        var product = productRepository.findById(productId)
                .orElseThrow(() -> new NotFoundException("Product with id " + productId + " not found"));
        var newQuantity = product.quantity().add(quantity);
        var currentValue = product.quantity().multiply(product.averageUnitCost());
        var returnedValue = quantity.multiply(returnUnitCost);
        var newAverageUnitCost = currentValue.add(returnedValue)
                .divide(newQuantity, UNIT_COST_SCALE, RoundingMode.HALF_UP);
        if (productRepository.updateStock(productId, newQuantity, newAverageUnitCost) == 0) {
            throw new NotFoundException("Product with id " + productId + " not found");
        }
    }

    private void validateReturnInput(
            SaleReturnItemInput input,
            HashSet<Long> requestedItemIds) {
        if (input == null || input.saleItemId() == null || input.quantity() == null
                || input.quantity().signum() <= 0
                || input.quantity().stripTrailingZeros().scale() > 0) {
            throw new IllegalArgumentException(
                    "Every return item must identify a sale item and have a positive whole quantity");
        }
        if (!requestedItemIds.add(input.saleItemId())) {
            throw new IllegalArgumentException("Each sale item can appear only once in a return");
        }
    }

    private void validateOperationDate(SaleDto sale, LocalDate operationDate, String fieldName) {
        if (operationDate.isBefore(sale.saleDate())) {
            throw new IllegalArgumentException(fieldName + " cannot be earlier than the sale date");
        }
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

    private record PreparedReturnItem(
            SaleItemDto item,
            BigDecimal quantity,
            BigDecimal lineRefund,
            BigDecimal lineCost) {
    }
}
