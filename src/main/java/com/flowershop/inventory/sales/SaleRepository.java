package com.flowershop.inventory.sales;

import java.math.BigDecimal;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class SaleRepository {

    private static final DateTimeFormatter DOCUMENT_NUMBER_DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private static final String SALE_SUMMARY_QUERY = """
            SELECT s.id, s.sale_number, s.sale_date, s.payment_method, s.status, s.notes,
                   s.total_revenue, s.total_cost, s.gross_profit, s.created_at,
                   COALESCE(reversals.refunded_revenue, 0) AS refunded_revenue,
                   COALESCE(reversals.returned_cost, 0) AS returned_cost,
                   COALESCE(reversals.reversed_gross_profit, 0) AS reversed_gross_profit
            FROM sale s
            LEFT JOIN (
                SELECT sale_id,
                       SUM(total_refund) AS refunded_revenue,
                       SUM(total_cost) AS returned_cost,
                       SUM(gross_profit_reversal) AS reversed_gross_profit
                FROM sale_return
                GROUP BY sale_id
            ) reversals ON reversals.sale_id = s.id
            """;

    private final JdbcTemplate jdbcTemplate;

    public SaleRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<SaleDto> findAll() {
        return jdbcTemplate.query(
                        SALE_SUMMARY_QUERY + " ORDER BY s.sale_date DESC, s.id DESC",
                        (rs, rowNum) -> map(rs, List.of(), List.of()))
                .stream()
                .map(this::withDetails)
                .toList();
    }

    public Optional<SaleDto> findById(long id) {
        return jdbcTemplate.query(
                        SALE_SUMMARY_QUERY + " WHERE s.id = ?",
                        (rs, rowNum) -> map(rs, List.of(), List.of()),
                        id)
                .stream()
                .findFirst()
                .map(this::withDetails);
    }

    public String nextSaleNumber(LocalDate saleDate) {
        return nextDocumentNumber("SALE", "sale", "sale_number", saleDate);
    }

    public String nextReturnNumber(LocalDate returnDate) {
        return nextDocumentNumber("RET", "sale_return", "return_number", returnDate);
    }

    public long insert(
            String saleNumber,
            LocalDate saleDate,
            PaymentMethod paymentMethod,
            String notes,
            BigDecimal totalRevenue,
            BigDecimal totalCost,
            BigDecimal grossProfit) {
        var keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(
                    """
                    INSERT INTO sale
                        (sale_number, sale_date, payment_method, notes,
                         total_revenue, total_cost, gross_profit)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, saleNumber);
            statement.setString(2, saleDate.toString());
            statement.setString(3, paymentMethod.name());
            statement.setString(4, notes);
            statement.setBigDecimal(5, totalRevenue);
            statement.setBigDecimal(6, totalCost);
            statement.setBigDecimal(7, grossProfit);
            return statement;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public void insertItem(long saleId, SaleItemDto item) {
        jdbcTemplate.update(
                """
                INSERT INTO sale_item
                    (sale_id, product_id, product_sku, product_name, quantity,
                     recommended_unit_price, unit_price, unit_cost,
                     line_revenue, line_cost, line_profit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                saleId,
                item.productId(),
                item.productSku(),
                item.productName(),
                item.quantity(),
                item.recommendedUnitPrice(),
                item.unitPrice(),
                item.unitCost(),
                item.lineRevenue(),
                item.lineCost(),
                item.lineProfit());
    }

    public long insertReturn(
            long saleId,
            String returnNumber,
            LocalDate returnDate,
            SaleReturnType operationType,
            String reason,
            String notes,
            BigDecimal totalRefund,
            BigDecimal totalCost,
            BigDecimal grossProfitReversal) {
        var keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(
                    """
                    INSERT INTO sale_return
                        (sale_id, return_number, return_date, operation_type, reason, notes,
                         total_refund, total_cost, gross_profit_reversal)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, saleId);
            statement.setString(2, returnNumber);
            statement.setString(3, returnDate.toString());
            statement.setString(4, operationType.name());
            statement.setString(5, reason);
            statement.setString(6, notes);
            statement.setBigDecimal(7, totalRefund);
            statement.setBigDecimal(8, totalCost);
            statement.setBigDecimal(9, grossProfitReversal);
            return statement;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public void insertReturnItem(long saleReturnId, SaleReturnItemDto item) {
        jdbcTemplate.update(
                """
                INSERT INTO sale_return_item
                    (sale_return_id, sale_item_id, product_id, quantity,
                     unit_price, unit_cost, line_refund, line_cost, gross_profit_reversal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                saleReturnId,
                item.saleItemId(),
                item.productId(),
                item.quantity(),
                item.unitPrice(),
                item.unitCost(),
                item.lineRefund(),
                item.lineCost(),
                item.grossProfitReversal());
    }

    public int updateStatus(long saleId, SaleStatus status) {
        return jdbcTemplate.update("UPDATE sale SET status = ? WHERE id = ?", status.name(), saleId);
    }

    public long count() {
        Long value = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sale WHERE status <> 'CANCELLED'",
                Long.class);
        return value == null ? 0L : value;
    }

    private String nextDocumentNumber(
            String type,
            String table,
            String numberColumn,
            LocalDate date) {
        var prefix = type + "-" + date.format(DOCUMENT_NUMBER_DATE) + "-";
        Integer maximum = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(CAST(SUBSTR(" + numberColumn + ", ?) AS INTEGER)), 0) "
                        + "FROM " + table + " WHERE " + numberColumn + " LIKE ?",
                Integer.class,
                prefix.length() + 1,
                prefix + "%");
        return prefix + "%04d".formatted((maximum == null ? 0 : maximum) + 1);
    }

    private SaleDto withDetails(SaleDto sale) {
        return new SaleDto(
                sale.id(),
                sale.saleNumber(),
                sale.saleDate(),
                sale.paymentMethod(),
                sale.status(),
                sale.notes(),
                sale.totalRevenue(),
                sale.totalCost(),
                sale.grossProfit(),
                sale.refundedRevenue(),
                sale.returnedCost(),
                sale.reversedGrossProfit(),
                sale.netRevenue(),
                sale.netCost(),
                sale.netGrossProfit(),
                findItems(sale.id()),
                findReturns(sale.id()),
                sale.createdAt());
    }

    private List<SaleItemDto> findItems(long saleId) {
        return jdbcTemplate.query(
                """
                SELECT si.id, si.product_id, si.product_sku, si.product_name, si.quantity,
                       si.recommended_unit_price, si.unit_price, si.unit_cost,
                       si.line_revenue, si.line_cost, si.line_profit,
                       COALESCE(SUM(sri.quantity), 0) AS returned_quantity
                FROM sale_item si
                LEFT JOIN sale_return_item sri ON sri.sale_item_id = si.id
                WHERE si.sale_id = ?
                GROUP BY si.id, si.product_id, si.product_sku, si.product_name, si.quantity,
                         si.recommended_unit_price, si.unit_price, si.unit_cost,
                         si.line_revenue, si.line_cost, si.line_profit
                ORDER BY si.id
                """,
                (rs, rowNum) -> new SaleItemDto(
                        rs.getLong("id"),
                        rs.getLong("product_id"),
                        rs.getString("product_sku"),
                        rs.getString("product_name"),
                        rs.getBigDecimal("quantity"),
                        rs.getBigDecimal("recommended_unit_price"),
                        rs.getBigDecimal("unit_price"),
                        rs.getBigDecimal("unit_cost"),
                        rs.getBigDecimal("line_revenue"),
                        rs.getBigDecimal("line_cost"),
                        rs.getBigDecimal("line_profit"),
                        rs.getBigDecimal("returned_quantity")),
                saleId);
    }

    private List<SaleReturnDto> findReturns(long saleId) {
        return jdbcTemplate.query(
                        """
                        SELECT id, return_number, return_date, operation_type, reason, notes,
                               total_refund, total_cost, gross_profit_reversal, created_at
                        FROM sale_return
                        WHERE sale_id = ?
                        ORDER BY return_date, id
                        """,
                        (rs, rowNum) -> new SaleReturnDto(
                                rs.getLong("id"),
                                rs.getString("return_number"),
                                LocalDate.parse(rs.getString("return_date")),
                                SaleReturnType.valueOf(rs.getString("operation_type")),
                                rs.getString("reason"),
                                rs.getString("notes"),
                                rs.getBigDecimal("total_refund"),
                                rs.getBigDecimal("total_cost"),
                                rs.getBigDecimal("gross_profit_reversal"),
                                List.of(),
                                rs.getString("created_at")),
                        saleId)
                .stream()
                .map(this::withReturnItems)
                .toList();
    }

    private SaleReturnDto withReturnItems(SaleReturnDto saleReturn) {
        return new SaleReturnDto(
                saleReturn.id(),
                saleReturn.returnNumber(),
                saleReturn.returnDate(),
                saleReturn.operationType(),
                saleReturn.reason(),
                saleReturn.notes(),
                saleReturn.totalRefund(),
                saleReturn.totalCost(),
                saleReturn.grossProfitReversal(),
                findReturnItems(saleReturn.id()),
                saleReturn.createdAt());
    }

    private List<SaleReturnItemDto> findReturnItems(long saleReturnId) {
        return jdbcTemplate.query(
                """
                SELECT sri.sale_item_id, sri.product_id, si.product_sku, si.product_name,
                       sri.quantity, sri.unit_price, sri.unit_cost,
                       sri.line_refund, sri.line_cost, sri.gross_profit_reversal
                FROM sale_return_item sri
                JOIN sale_item si ON si.id = sri.sale_item_id
                WHERE sri.sale_return_id = ?
                ORDER BY sri.id
                """,
                (rs, rowNum) -> new SaleReturnItemDto(
                        rs.getLong("sale_item_id"),
                        rs.getLong("product_id"),
                        rs.getString("product_sku"),
                        rs.getString("product_name"),
                        rs.getBigDecimal("quantity"),
                        rs.getBigDecimal("unit_price"),
                        rs.getBigDecimal("unit_cost"),
                        rs.getBigDecimal("line_refund"),
                        rs.getBigDecimal("line_cost"),
                        rs.getBigDecimal("gross_profit_reversal")),
                saleReturnId);
    }

    private SaleDto map(
            java.sql.ResultSet rs,
            List<SaleItemDto> items,
            List<SaleReturnDto> returns) throws java.sql.SQLException {
        var totalRevenue = rs.getBigDecimal("total_revenue");
        var totalCost = rs.getBigDecimal("total_cost");
        var grossProfit = rs.getBigDecimal("gross_profit");
        var refundedRevenue = rs.getBigDecimal("refunded_revenue");
        var returnedCost = rs.getBigDecimal("returned_cost");
        var reversedGrossProfit = rs.getBigDecimal("reversed_gross_profit");
        return new SaleDto(
                rs.getLong("id"),
                rs.getString("sale_number"),
                LocalDate.parse(rs.getString("sale_date")),
                PaymentMethod.valueOf(rs.getString("payment_method")),
                SaleStatus.valueOf(rs.getString("status")),
                rs.getString("notes"),
                totalRevenue,
                totalCost,
                grossProfit,
                refundedRevenue,
                returnedCost,
                reversedGrossProfit,
                totalRevenue.subtract(refundedRevenue),
                totalCost.subtract(returnedCost),
                grossProfit.subtract(reversedGrossProfit),
                items,
                returns,
                rs.getString("created_at"));
    }
}
