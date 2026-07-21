package com.flowershop.inventory.reports;

import com.flowershop.inventory.sales.PaymentMethod;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record MonthlySalesReportDto(
        String month,
        LocalDate periodStart,
        LocalDate periodEnd,
        long salesCount,
        BigDecimal unitsSold,
        BigDecimal revenue,
        BigDecimal totalCost,
        BigDecimal grossProfit,
        BigDecimal averageSaleValue,
        List<PaymentSummary> paymentSummaries,
        List<DailySummary> dailySummaries,
        List<ProductSummary> productSummaries,
        List<SaleSummary> sales) {

    public record PaymentSummary(
            PaymentMethod paymentMethod,
            long salesCount,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}

    public record DailySummary(
            LocalDate saleDate,
            long salesCount,
            BigDecimal unitsSold,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}

    public record ProductSummary(
            long productId,
            String productSku,
            String productName,
            BigDecimal quantitySold,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}

    public record SaleSummary(
            long id,
            String saleNumber,
            LocalDate saleDate,
            PaymentMethod paymentMethod,
            long productLines,
            BigDecimal unitsSold,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}
}
