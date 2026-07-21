package com.flowershop.inventory.reports;

import com.flowershop.inventory.reports.MonthlySalesReportDto.DailySummary;
import com.flowershop.inventory.reports.MonthlySalesReportDto.PaymentSummary;
import com.flowershop.inventory.reports.MonthlySalesReportDto.ProductSummary;
import com.flowershop.inventory.reports.MonthlySalesReportDto.SaleSummary;
import com.flowershop.inventory.sales.PaymentMethod;
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

    OverallTotals findOverallTotals(LocalDate start, LocalDate endExclusive) {
        var totals = jdbcTemplate.query(
                """
                SELECT COUNT(*) AS sales_count,
                       COALESCE(SUM(total_revenue), 0) AS revenue,
                       COALESCE(SUM(total_cost), 0) AS total_cost,
                       COALESCE(SUM(gross_profit), 0) AS gross_profit
                FROM sale
                WHERE sale_date >= ? AND sale_date < ?
                """,
                (rs, rowNum) -> new OverallTotals(
                        rs.getLong("sales_count"),
                        rs.getBigDecimal("revenue"),
                        rs.getBigDecimal("total_cost"),
                        rs.getBigDecimal("gross_profit")),
                start.toString(),
                endExclusive.toString());
        return totals.getFirst();
    }

    BigDecimal findUnitsSold(LocalDate start, LocalDate endExclusive) {
        var value = jdbcTemplate.queryForObject(
                """
                SELECT COALESCE(SUM(si.quantity), 0)
                FROM sale_item si
                JOIN sale s ON s.id = si.sale_id
                WHERE s.sale_date >= ? AND s.sale_date < ?
                """,
                BigDecimal.class,
                start.toString(),
                endExclusive.toString());
        return value == null ? BigDecimal.ZERO : value;
    }

    List<PaymentSummary> findPaymentSummaries(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT payment_method, COUNT(*) AS sales_count,
                       COALESCE(SUM(total_revenue), 0) AS revenue,
                       COALESCE(SUM(total_cost), 0) AS total_cost,
                       COALESCE(SUM(gross_profit), 0) AS gross_profit
                FROM sale
                WHERE sale_date >= ? AND sale_date < ?
                GROUP BY payment_method
                """,
                (rs, rowNum) -> new PaymentSummary(
                        PaymentMethod.valueOf(rs.getString("payment_method")),
                        rs.getLong("sales_count"),
                        rs.getBigDecimal("revenue"),
                        rs.getBigDecimal("total_cost"),
                        rs.getBigDecimal("gross_profit")),
                start.toString(),
                endExclusive.toString());
    }

    List<DailySummary> findDailySummaries(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT s.sale_date, COUNT(DISTINCT s.id) AS sales_count,
                       COALESCE(SUM(si.quantity), 0) AS units_sold,
                       COALESCE(SUM(si.line_revenue), 0) AS revenue,
                       COALESCE(SUM(si.line_cost), 0) AS total_cost,
                       COALESCE(SUM(si.line_profit), 0) AS gross_profit
                FROM sale s
                JOIN sale_item si ON si.sale_id = s.id
                WHERE s.sale_date >= ? AND s.sale_date < ?
                GROUP BY s.sale_date
                ORDER BY s.sale_date
                """,
                (rs, rowNum) -> new DailySummary(
                        LocalDate.parse(rs.getString("sale_date")),
                        rs.getLong("sales_count"),
                        rs.getBigDecimal("units_sold"),
                        rs.getBigDecimal("revenue"),
                        rs.getBigDecimal("total_cost"),
                        rs.getBigDecimal("gross_profit")),
                start.toString(),
                endExclusive.toString());
    }

    List<ProductSummary> findProductSummaries(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT si.product_id, si.product_sku, si.product_name,
                       COALESCE(SUM(si.quantity), 0) AS quantity_sold,
                       COALESCE(SUM(si.line_revenue), 0) AS revenue,
                       COALESCE(SUM(si.line_cost), 0) AS total_cost,
                       COALESCE(SUM(si.line_profit), 0) AS gross_profit
                FROM sale_item si
                JOIN sale s ON s.id = si.sale_id
                WHERE s.sale_date >= ? AND s.sale_date < ?
                GROUP BY si.product_id, si.product_sku, si.product_name
                ORDER BY revenue DESC, si.product_name
                """,
                (rs, rowNum) -> new ProductSummary(
                        rs.getLong("product_id"),
                        rs.getString("product_sku"),
                        rs.getString("product_name"),
                        rs.getBigDecimal("quantity_sold"),
                        rs.getBigDecimal("revenue"),
                        rs.getBigDecimal("total_cost"),
                        rs.getBigDecimal("gross_profit")),
                start.toString(),
                endExclusive.toString());
    }

    List<SaleSummary> findSales(LocalDate start, LocalDate endExclusive) {
        return jdbcTemplate.query(
                """
                SELECT s.id, s.sale_number, s.sale_date, s.payment_method,
                       COUNT(si.id) AS product_lines,
                       COALESCE(SUM(si.quantity), 0) AS units_sold,
                       s.total_revenue AS revenue,
                       s.total_cost AS total_cost,
                       s.gross_profit AS gross_profit
                FROM sale s
                JOIN sale_item si ON si.sale_id = s.id
                WHERE s.sale_date >= ? AND s.sale_date < ?
                GROUP BY s.id, s.sale_number, s.sale_date, s.payment_method,
                         s.total_revenue, s.total_cost, s.gross_profit
                ORDER BY s.sale_date DESC, s.id DESC
                """,
                (rs, rowNum) -> new SaleSummary(
                        rs.getLong("id"),
                        rs.getString("sale_number"),
                        LocalDate.parse(rs.getString("sale_date")),
                        PaymentMethod.valueOf(rs.getString("payment_method")),
                        rs.getLong("product_lines"),
                        rs.getBigDecimal("units_sold"),
                        rs.getBigDecimal("revenue"),
                        rs.getBigDecimal("total_cost"),
                        rs.getBigDecimal("gross_profit")),
                start.toString(),
                endExclusive.toString());
    }

    record OverallTotals(
            long salesCount,
            BigDecimal revenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {}
}
