package com.flowershop.inventory.reports;

import com.flowershop.inventory.sales.PaymentMethod;
import com.flowershop.inventory.sales.SaleReturnType;
import com.flowershop.inventory.sales.SaleStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record MonthlySalesReportDto(
        String month,
        LocalDate periodStart,
        LocalDate periodEnd,
        long salesCount,
        long returnCount,
        BigDecimal unitsSold,
        BigDecimal unitsReturned,
        BigDecimal grossRevenue,
        BigDecimal refunds,
        BigDecimal revenue,
        BigDecimal grossCost,
        BigDecimal returnedCost,
        BigDecimal totalCost,
        BigDecimal grossProfit,
        BigDecimal averageSaleValue,
        List<PaymentSummary> paymentSummaries,
        List<DailySummary> dailySummaries,
        List<ProductSummary> productSummaries,
        List<SaleSummary> sales,
        List<ReturnSummary> returns) {

    public record PaymentSummary(
            PaymentMethod paymentMethod,
            long salesCount,
            long returnCount,
            BigDecimal grossRevenue,
            BigDecimal refunds,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}

    public record DailySummary(
            LocalDate saleDate,
            long salesCount,
            long returnCount,
            BigDecimal unitsSold,
            BigDecimal unitsReturned,
            BigDecimal grossRevenue,
            BigDecimal refunds,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}

    public record ProductSummary(
            long productId,
            String productSku,
            String productName,
            BigDecimal quantitySold,
            BigDecimal quantityReturned,
            BigDecimal netQuantity,
            BigDecimal grossRevenue,
            BigDecimal refunds,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}

    public record SaleSummary(
            long id,
            String saleNumber,
            LocalDate saleDate,
            PaymentMethod paymentMethod,
            SaleStatus status,
            long productLines,
            BigDecimal unitsSold,
            BigDecimal revenue,
            BigDecimal refunds,
            BigDecimal netRevenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}

    public record ReturnSummary(
            long id,
            String returnNumber,
            SaleReturnType operationType,
            long saleId,
            String saleNumber,
            LocalDate returnDate,
            PaymentMethod paymentMethod,
            BigDecimal unitsReturned,
            BigDecimal refund,
            BigDecimal returnedCost,
            BigDecimal grossProfitReversal) {}
}
