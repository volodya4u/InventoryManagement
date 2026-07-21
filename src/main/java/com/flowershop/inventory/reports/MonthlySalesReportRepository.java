package com.flowershop.inventory.reports;

import com.flowershop.inventory.reports.MonthlySalesReportDto.DailySummary;
import com.flowershop.inventory.reports.MonthlySalesReportDto.PaymentSummary;
import com.flowershop.inventory.reports.MonthlySalesReportDto.ProductSummary;
import com.flowershop.inventory.reports.MonthlySalesReportDto.ReturnSummary;
import com.flowershop.inventory.reports.MonthlySalesReportDto.SaleSummary;
import com.flowershop.inventory.sales.PaymentMethod;
import com.flowershop.inventory.sales.SaleReturnType;
import com.flowershop.inventory.sales.SaleStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class MonthlySalesReportRepository {

    private final JdbcTemplate jdbcTemplate;

    MonthlySalesReportRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    SalesTotals findSalesTotals(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT COUNT(*) AS sales_count,
                       COALESCE(SUM(total_revenue), 0) AS gross_revenue,
                       COALESCE(SUM(total_cost), 0) AS gross_cost,
                       COALESCE((
                           SELECT SUM(si.quantity)
                           FROM sale_item si
                           JOIN sale item_sale ON item_sale.id = si.sale_id
                           WHERE item_sale.sale_date >= ? AND item_sale.sale_date < ?
                       ), 0) AS units_sold
                FROM sale
                WHERE sale_date >= ? AND sale_date < ?
                """,
                (rs, rowNum) -> new SalesTotals(
                        rs.getLong("sales_count"),
                        rs.getBigDecimal("units_sold"),
                        rs.getBigDecimal("gross_revenue"),
                        rs.getBigDecimal("gross_cost")),
                start.toString(),
                endExclusive.toString(),
                start.toString(),
                endExclusive.toString()).getFirst();
    }

    ReturnTotals findReturnTotals(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT COUNT(*) AS return_count,
                       COALESCE(SUM(total_refund), 0) AS refunds,
                       COALESCE(SUM(total_cost), 0) AS returned_cost,
                       COALESCE((
                           SELECT SUM(sri.quantity)
                           FROM sale_return_item sri
                           JOIN sale_return item_return ON item_return.id = sri.sale_return_id
                           WHERE item_return.return_date >= ? AND item_return.return_date < ?
                       ), 0) AS units_returned
                FROM sale_return
                WHERE return_date >= ? AND return_date < ?
                """,
                (rs, rowNum) -> new ReturnTotals(
                        rs.getLong("return_count"),
                        rs.getBigDecimal("units_returned"),
                        rs.getBigDecimal("refunds"),
                        rs.getBigDecimal("returned_cost")),
                start.toString(),
                endExclusive.toString(),
                start.toString(),
                endExclusive.toString()).getFirst();
    }

    List<PaymentSummary> findPaymentSummaries(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT payment_method,
                       SUM(sales_count) AS sales_count,
                       SUM(return_count) AS return_count,
                       SUM(gross_revenue) AS gross_revenue,
                       SUM(refunds) AS refunds,
                       SUM(gross_cost) AS gross_cost,
                       SUM(returned_cost) AS returned_cost
                FROM (
                    SELECT payment_method, COUNT(*) AS sales_count, 0 AS return_count,
                           SUM(total_revenue) AS gross_revenue, 0 AS refunds,
                           SUM(total_cost) AS gross_cost, 0 AS returned_cost
                    FROM sale
                    WHERE sale_date >= ? AND sale_date < ?
                    GROUP BY payment_method
                    UNION ALL
                    SELECT s.payment_method, 0, COUNT(*), 0,
                           SUM(sr.total_refund), 0, SUM(sr.total_cost)
                    FROM sale_return sr
                    JOIN sale s ON s.id = sr.sale_id
                    WHERE sr.return_date >= ? AND sr.return_date < ?
                    GROUP BY s.payment_method
                ) activity
                GROUP BY payment_method
                """,
                (rs, rowNum) -> paymentSummary(
                        PaymentMethod.valueOf(rs.getString("payment_method")),
                        rs.getLong("sales_count"),
                        rs.getLong("return_count"),
                        rs.getBigDecimal("gross_revenue"),
                        rs.getBigDecimal("refunds"),
                        rs.getBigDecimal("gross_cost"),
                        rs.getBigDecimal("returned_cost")),
                start.toString(),
                endExclusive.toString(),
                start.toString(),
                endExclusive.toString());
    }

    List<DailySummary> findDailySummaries(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT activity_date,
                       SUM(sales_count) AS sales_count,
                       SUM(return_count) AS return_count,
                       SUM(units_sold) AS units_sold,
                       SUM(units_returned) AS units_returned,
                       SUM(gross_revenue) AS gross_revenue,
                       SUM(refunds) AS refunds,
                       SUM(gross_cost) AS gross_cost,
                       SUM(returned_cost) AS returned_cost
                FROM (
                    SELECT s.sale_date AS activity_date,
                           COUNT(DISTINCT s.id) AS sales_count, 0 AS return_count,
                           SUM(si.quantity) AS units_sold, 0 AS units_returned,
                           SUM(si.line_revenue) AS gross_revenue, 0 AS refunds,
                           SUM(si.line_cost) AS gross_cost, 0 AS returned_cost
                    FROM sale s
                    JOIN sale_item si ON si.sale_id = s.id
                    WHERE s.sale_date >= ? AND s.sale_date < ?
                    GROUP BY s.sale_date
                    UNION ALL
                    SELECT sr.return_date, 0, COUNT(DISTINCT sr.id),
                           0, SUM(sri.quantity), 0, SUM(sri.line_refund),
                           0, SUM(sri.line_cost)
                    FROM sale_return sr
                    JOIN sale_return_item sri ON sri.sale_return_id = sr.id
                    WHERE sr.return_date >= ? AND sr.return_date < ?
                    GROUP BY sr.return_date
                ) activity
                GROUP BY activity_date
                ORDER BY activity_date
                """,
                (rs, rowNum) -> dailySummary(
                        LocalDate.parse(rs.getString("activity_date")),
                        rs.getLong("sales_count"),
                        rs.getLong("return_count"),
                        rs.getBigDecimal("units_sold"),
                        rs.getBigDecimal("units_returned"),
                        rs.getBigDecimal("gross_revenue"),
                        rs.getBigDecimal("refunds"),
                        rs.getBigDecimal("gross_cost"),
                        rs.getBigDecimal("returned_cost")),
                start.toString(),
                endExclusive.toString(),
                start.toString(),
                endExclusive.toString());
    }

    List<ProductSummary> findProductSummaries(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT product_id, product_sku, product_name,
                       SUM(quantity_sold) AS quantity_sold,
                       SUM(quantity_returned) AS quantity_returned,
                       SUM(gross_revenue) AS gross_revenue,
                       SUM(refunds) AS refunds,
                       SUM(gross_cost) AS gross_cost,
                       SUM(returned_cost) AS returned_cost
                FROM (
                    SELECT si.product_id, si.product_sku, si.product_name,
                           SUM(si.quantity) AS quantity_sold, 0 AS quantity_returned,
                           SUM(si.line_revenue) AS gross_revenue, 0 AS refunds,
                           SUM(si.line_cost) AS gross_cost, 0 AS returned_cost
                    FROM sale_item si
                    JOIN sale s ON s.id = si.sale_id
                    WHERE s.sale_date >= ? AND s.sale_date < ?
                    GROUP BY si.product_id, si.product_sku, si.product_name
                    UNION ALL
                    SELECT sri.product_id, si.product_sku, si.product_name,
                           0, SUM(sri.quantity), 0, SUM(sri.line_refund),
                           0, SUM(sri.line_cost)
                    FROM sale_return_item sri
                    JOIN sale_return sr ON sr.id = sri.sale_return_id
                    JOIN sale_item si ON si.id = sri.sale_item_id
                    WHERE sr.return_date >= ? AND sr.return_date < ?
                    GROUP BY sri.product_id, si.product_sku, si.product_name
                ) activity
                GROUP BY product_id, product_sku, product_name
                ORDER BY (SUM(gross_revenue) - SUM(refunds)) DESC, product_name
                """,
                (rs, rowNum) -> productSummary(
                        rs.getLong("product_id"),
                        rs.getString("product_sku"),
                        rs.getString("product_name"),
                        rs.getBigDecimal("quantity_sold"),
                        rs.getBigDecimal("quantity_returned"),
                        rs.getBigDecimal("gross_revenue"),
                        rs.getBigDecimal("refunds"),
                        rs.getBigDecimal("gross_cost"),
                        rs.getBigDecimal("returned_cost")),
                start.toString(),
                endExclusive.toString(),
                start.toString(),
                endExclusive.toString());
    }

    List<SaleSummary> findSales(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT s.id, s.sale_number, s.sale_date, s.payment_method, s.status,
                       COUNT(si.id) AS product_lines,
                       COALESCE(SUM(si.quantity), 0) AS units_sold,
                       s.total_revenue AS revenue,
                       COALESCE(reversals.refunds, 0) AS refunds,
                       s.total_cost - COALESCE(reversals.returned_cost, 0) AS net_cost,
                       s.gross_profit - COALESCE(reversals.reversed_profit, 0) AS net_profit
                FROM sale s
                JOIN sale_item si ON si.sale_id = s.id
                LEFT JOIN (
                    SELECT sale_id, SUM(total_refund) AS refunds,
                           SUM(total_cost) AS returned_cost,
                           SUM(gross_profit_reversal) AS reversed_profit
                    FROM sale_return
                    GROUP BY sale_id
                ) reversals ON reversals.sale_id = s.id
                WHERE s.sale_date >= ? AND s.sale_date < ?
                GROUP BY s.id, s.sale_number, s.sale_date, s.payment_method, s.status,
                         s.total_revenue, s.total_cost, s.gross_profit,
                         reversals.refunds, reversals.returned_cost, reversals.reversed_profit
                ORDER BY s.sale_date DESC, s.id DESC
                """,
                (rs, rowNum) -> new SaleSummary(
                        rs.getLong("id"),
                        rs.getString("sale_number"),
                        LocalDate.parse(rs.getString("sale_date")),
                        PaymentMethod.valueOf(rs.getString("payment_method")),
                        SaleStatus.valueOf(rs.getString("status")),
                        rs.getLong("product_lines"),
                        rs.getBigDecimal("units_sold"),
                        rs.getBigDecimal("revenue"),
                        rs.getBigDecimal("refunds"),
                        rs.getBigDecimal("revenue").subtract(rs.getBigDecimal("refunds")),
                        rs.getBigDecimal("net_cost"),
                        rs.getBigDecimal("net_profit")),
                start.toString(),
                endExclusive.toString());
    }

    List<ReturnSummary> findReturns(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT sr.id, sr.return_number, sr.operation_type, sr.sale_id,
                       s.sale_number, sr.return_date, s.payment_method,
                       COALESCE(SUM(sri.quantity), 0) AS units_returned,
                       sr.total_refund, sr.total_cost, sr.gross_profit_reversal
                FROM sale_return sr
                JOIN sale s ON s.id = sr.sale_id
                JOIN sale_return_item sri ON sri.sale_return_id = sr.id
                WHERE sr.return_date >= ? AND sr.return_date < ?
                GROUP BY sr.id, sr.return_number, sr.operation_type, sr.sale_id,
                         s.sale_number, sr.return_date, s.payment_method,
                         sr.total_refund, sr.total_cost, sr.gross_profit_reversal
                ORDER BY sr.return_date DESC, sr.id DESC
                """,
                (rs, rowNum) -> new ReturnSummary(
                        rs.getLong("id"),
                        rs.getString("return_number"),
                        SaleReturnType.valueOf(rs.getString("operation_type")),
                        rs.getLong("sale_id"),
                        rs.getString("sale_number"),
                        LocalDate.parse(rs.getString("return_date")),
                        PaymentMethod.valueOf(rs.getString("payment_method")),
                        rs.getBigDecimal("units_returned"),
                        rs.getBigDecimal("total_refund"),
                        rs.getBigDecimal("total_cost"),
                        rs.getBigDecimal("gross_profit_reversal")),
                start.toString(),
                endExclusive.toString());
    }

    private PaymentSummary paymentSummary(
            PaymentMethod paymentMethod,
            long salesCount,
            long returnCount,
            BigDecimal grossRevenue,
            BigDecimal refunds,
            BigDecimal grossCost,
            BigDecimal returnedCost) {
        var netRevenue = grossRevenue.subtract(refunds);
        var netCost = grossCost.subtract(returnedCost);
        return new PaymentSummary(
                paymentMethod,
                salesCount,
                returnCount,
                grossRevenue,
                refunds,
                netRevenue,
                netCost,
                netRevenue.subtract(netCost));
    }

    private DailySummary dailySummary(
            LocalDate date,
            long salesCount,
            long returnCount,
            BigDecimal unitsSold,
            BigDecimal unitsReturned,
            BigDecimal grossRevenue,
            BigDecimal refunds,
            BigDecimal grossCost,
            BigDecimal returnedCost) {
        var netRevenue = grossRevenue.subtract(refunds);
        var netCost = grossCost.subtract(returnedCost);
        return new DailySummary(
                date,
                salesCount,
                returnCount,
                unitsSold.subtract(unitsReturned),
                unitsReturned,
                grossRevenue,
                refunds,
                netRevenue,
                netCost,
                netRevenue.subtract(netCost));
    }

    private ProductSummary productSummary(
            long productId,
            String productSku,
            String productName,
            BigDecimal quantitySold,
            BigDecimal quantityReturned,
            BigDecimal grossRevenue,
            BigDecimal refunds,
            BigDecimal grossCost,
            BigDecimal returnedCost) {
        var netRevenue = grossRevenue.subtract(refunds);
        var netCost = grossCost.subtract(returnedCost);
        return new ProductSummary(
                productId,
                productSku,
                productName,
                quantitySold,
                quantityReturned,
                quantitySold.subtract(quantityReturned),
                grossRevenue,
                refunds,
                netRevenue,
                netCost,
                netRevenue.subtract(netCost));
    }

    record SalesTotals(
            long salesCount,
            BigDecimal unitsSold,
            BigDecimal grossRevenue,
            BigDecimal grossCost) {}

    record ReturnTotals(
            long returnCount,
            BigDecimal unitsReturned,
            BigDecimal refunds,
            BigDecimal returnedCost) {}
}
