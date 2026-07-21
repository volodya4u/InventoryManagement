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

    private static final DateTimeFormatter SALE_NUMBER_DATE = DateTimeFormatter.BASIC_ISO_DATE;

    private final JdbcTemplate jdbcTemplate;

    public SaleRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<SaleDto> findAll() {
        return jdbcTemplate.query(
                        """
                        SELECT id, sale_number, sale_date, payment_method, notes,
                               total_revenue, total_cost, gross_profit, created_at
                        FROM sale
                        ORDER BY sale_date DESC, id DESC
                        """,
                        (rs, rowNum) -> map(rs, List.of()))
                .stream()
                .map(this::withItems)
                .toList();
    }

    public Optional<SaleDto> findById(long id) {
        return jdbcTemplate.query(
                        """
                        SELECT id, sale_number, sale_date, payment_method, notes,
                               total_revenue, total_cost, gross_profit, created_at
                        FROM sale
                        WHERE id = ?
                        """,
                        (rs, rowNum) -> map(rs, List.of()),
                        id)
                .stream()
                .findFirst()
                .map(this::withItems);
    }

    public String nextSaleNumber(LocalDate saleDate) {
        var prefix = "SALE-" + saleDate.format(SALE_NUMBER_DATE) + "-";
        Integer maximum = jdbcTemplate.queryForObject(
                """
                SELECT COALESCE(MAX(CAST(SUBSTR(sale_number, ?) AS INTEGER)), 0)
                FROM sale
                WHERE sale_number LIKE ?
                """,
                Integer.class,
                prefix.length() + 1,
                prefix + "%");
        return prefix + "%04d".formatted((maximum == null ? 0 : maximum) + 1);
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

    public long count() {
        Long value = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sale", Long.class);
        return value == null ? 0L : value;
    }

    private SaleDto withItems(SaleDto sale) {
        return new SaleDto(
                sale.id(),
                sale.saleNumber(),
                sale.saleDate(),
                sale.paymentMethod(),
                sale.notes(),
                sale.totalRevenue(),
                sale.totalCost(),
                sale.grossProfit(),
                findItems(sale.id()),
                sale.createdAt());
    }

    private List<SaleItemDto> findItems(long saleId) {
        return jdbcTemplate.query(
                """
                SELECT product_id, product_sku, product_name, quantity,
                       recommended_unit_price, unit_price, unit_cost,
                       line_revenue, line_cost, line_profit
                FROM sale_item
                WHERE sale_id = ?
                ORDER BY id
                """,
                (rs, rowNum) -> new SaleItemDto(
                        rs.getLong("product_id"),
                        rs.getString("product_sku"),
                        rs.getString("product_name"),
                        rs.getBigDecimal("quantity"),
                        rs.getBigDecimal("recommended_unit_price"),
                        rs.getBigDecimal("unit_price"),
                        rs.getBigDecimal("unit_cost"),
                        rs.getBigDecimal("line_revenue"),
                        rs.getBigDecimal("line_cost"),
                        rs.getBigDecimal("line_profit")),
                saleId);
    }

    private SaleDto map(java.sql.ResultSet rs, List<SaleItemDto> items)
            throws java.sql.SQLException {
        return new SaleDto(
                rs.getLong("id"),
                rs.getString("sale_number"),
                LocalDate.parse(rs.getString("sale_date")),
                PaymentMethod.valueOf(rs.getString("payment_method")),
                rs.getString("notes"),
                rs.getBigDecimal("total_revenue"),
                rs.getBigDecimal("total_cost"),
                rs.getBigDecimal("gross_profit"),
                items,
                rs.getString("created_at"));
    }
}
