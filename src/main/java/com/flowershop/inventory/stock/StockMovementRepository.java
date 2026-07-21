package com.flowershop.inventory.stock;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StockMovementRepository {

    private static final String MOVEMENTS_CTE = """
            WITH movements AS (
                SELECT 'RAW_MATERIAL' AS inventory_type,
                       movement.id AS movement_id,
                       material.id AS item_id,
                       '' AS item_code,
                       material.name AS item_name,
                       material.unit AS unit,
                       movement.movement_type,
                       CASE WHEN movement.movement_type IN (
                           'OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_INCREASE'
                       ) THEN 'IN' ELSE 'OUT' END AS direction,
                       movement.quantity,
                       CASE WHEN movement.movement_type IN (
                           'OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_INCREASE'
                       ) THEN movement.quantity ELSE -movement.quantity END AS signed_quantity,
                       movement.unit_cost,
                       movement.total_cost,
                       CASE WHEN movement.movement_type IN (
                           'OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_INCREASE'
                       ) THEN movement.total_cost ELSE -movement.total_cost END AS signed_total_cost,
                       movement.occurred_at,
                       movement.notes,
                       '' AS reference_type,
                       NULL AS reference_id,
                       '' AS reference_number,
                       movement.created_at
                FROM raw_material_stock_movement movement
                JOIN raw_material material ON material.id = movement.raw_material_id

                UNION ALL

                SELECT 'PRODUCT' AS inventory_type,
                       movement.id AS movement_id,
                       product.id AS item_id,
                       product.sku AS item_code,
                       product.name AS item_name,
                       'PIECE' AS unit,
                       movement.movement_type,
                       CASE WHEN movement.movement_type IN (
                           'OPENING_BALANCE', 'PRODUCTION', 'ADJUSTMENT_INCREASE',
                           'SALE_RETURN', 'SALE_CANCELLATION'
                       ) THEN 'IN' ELSE 'OUT' END AS direction,
                       movement.quantity,
                       CASE WHEN movement.movement_type IN (
                           'OPENING_BALANCE', 'PRODUCTION', 'ADJUSTMENT_INCREASE',
                           'SALE_RETURN', 'SALE_CANCELLATION'
                       ) THEN movement.quantity ELSE -movement.quantity END AS signed_quantity,
                       movement.unit_cost,
                       movement.total_cost,
                       CASE WHEN movement.movement_type IN (
                           'OPENING_BALANCE', 'PRODUCTION', 'ADJUSTMENT_INCREASE',
                           'SALE_RETURN', 'SALE_CANCELLATION'
                       ) THEN movement.total_cost ELSE -movement.total_cost END AS signed_total_cost,
                       movement.occurred_at,
                       movement.notes,
                       CASE
                           WHEN movement.sale_return_id IS NOT NULL THEN 'SALE_RETURN'
                           WHEN movement.sale_id IS NOT NULL THEN 'SALE'
                           WHEN movement.production_batch_id IS NOT NULL THEN 'PRODUCTION_BATCH'
                           ELSE ''
                       END AS reference_type,
                       CASE
                           WHEN movement.sale_return_id IS NOT NULL THEN movement.sale_id
                           WHEN movement.sale_id IS NOT NULL THEN movement.sale_id
                           ELSE movement.production_batch_id
                       END AS reference_id,
                       CASE
                           WHEN movement.sale_return_id IS NOT NULL THEN sale_return.return_number
                           WHEN movement.sale_id IS NOT NULL THEN sale.sale_number
                           WHEN movement.production_batch_id IS NOT NULL
                               THEN 'Batch #' || CAST(movement.production_batch_id AS TEXT)
                           ELSE ''
                       END AS reference_number,
                       movement.created_at
                FROM product_stock_movement movement
                JOIN product ON product.id = movement.product_id
                LEFT JOIN sale ON sale.id = movement.sale_id
                LEFT JOIN sale_return ON sale_return.id = movement.sale_return_id
            )
            """;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public StockMovementRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public StockMovementHistoryDto find(StockMovementFilter filter) {
        var query = filteredQuery(filter);
        var count = jdbcTemplate.queryForObject(
                MOVEMENTS_CTE + "SELECT COUNT(*) FROM movements" + query.whereClause(),
                query.parameters(),
                Long.class);
        long totalElements = count == null ? 0L : count;

        var totals = jdbcTemplate.queryForObject(
                MOVEMENTS_CTE + """
                        SELECT COUNT(*) AS movement_count,
                               COALESCE(SUM(CASE WHEN direction = 'IN' THEN total_cost ELSE 0 END), 0)
                                   AS incoming_value,
                               COALESCE(SUM(CASE WHEN direction = 'OUT' THEN total_cost ELSE 0 END), 0)
                                   AS outgoing_value,
                               COALESCE(SUM(signed_total_cost), 0) AS net_value_change
                        FROM movements
                        """ + query.whereClause(),
                query.parameters(),
                (rs, rowNum) -> new StockMovementHistoryDto.Totals(
                        rs.getLong("movement_count"),
                        money(rs.getBigDecimal("incoming_value")),
                        money(rs.getBigDecimal("outgoing_value")),
                        money(rs.getBigDecimal("net_value_change"))));

        var pageParameters = new HashMap<>(query.parameters());
        pageParameters.put("limit", filter.size());
        pageParameters.put("offset", (long) filter.page() * filter.size());
        List<StockMovementDto> movements = jdbcTemplate.query(
                MOVEMENTS_CTE + "SELECT * FROM movements" + query.whereClause() + """

                        ORDER BY occurred_at DESC, created_at DESC, inventory_type, movement_id DESC
                        LIMIT :limit OFFSET :offset
                        """,
                pageParameters,
                (rs, rowNum) -> map(rs));

        int totalPages = totalElements == 0
                ? 0
                : (int) Math.ceil((double) totalElements / filter.size());
        return new StockMovementHistoryDto(
                movements,
                totalElements,
                filter.page(),
                filter.size(),
                totalPages,
                totals == null
                        ? new StockMovementHistoryDto.Totals(
                                0, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO)
                        : totals);
    }

    private FilteredQuery filteredQuery(StockMovementFilter filter) {
        var conditions = new java.util.ArrayList<String>();
        Map<String, Object> parameters = new HashMap<>();
        if (filter.inventoryType() != InventoryType.ALL) {
            conditions.add("inventory_type = :inventoryType");
            parameters.put("inventoryType", filter.inventoryType().name());
        }
        if (filter.movementType() != null) {
            conditions.add("movement_type = :movementType");
            parameters.put("movementType", filter.movementType().name());
        }
        if (!filter.query().isBlank()) {
            conditions.add("(LOWER(item_name) LIKE :query OR LOWER(item_code) LIKE :query)");
            parameters.put("query", "%" + filter.query().toLowerCase() + "%");
        }
        if (filter.from() != null) {
            conditions.add("occurred_at >= :fromDate");
            parameters.put("fromDate", filter.from().toString());
        }
        if (filter.to() != null) {
            conditions.add("occurred_at <= :toDate");
            parameters.put("toDate", filter.to().toString());
        }
        return new FilteredQuery(
                conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions),
                parameters);
    }

    private StockMovementDto map(ResultSet rs) throws SQLException {
        Long referenceId = rs.getObject("reference_id") == null
                ? null
                : rs.getLong("reference_id");
        return new StockMovementDto(
                rs.getString("inventory_type"),
                rs.getLong("movement_id"),
                rs.getLong("item_id"),
                rs.getString("item_code"),
                rs.getString("item_name"),
                rs.getString("unit"),
                rs.getString("movement_type"),
                rs.getString("direction"),
                rs.getBigDecimal("quantity"),
                rs.getBigDecimal("signed_quantity"),
                rs.getBigDecimal("unit_cost"),
                money(rs.getBigDecimal("total_cost")),
                money(rs.getBigDecimal("signed_total_cost")),
                LocalDate.parse(rs.getString("occurred_at")),
                rs.getString("notes"),
                rs.getString("reference_type"),
                referenceId,
                rs.getString("reference_number"),
                rs.getString("created_at"));
    }

    private BigDecimal money(BigDecimal value) {
        return value.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    public record StockMovementFilter(
            InventoryType inventoryType,
            StockMovementType movementType,
            String query,
            LocalDate from,
            LocalDate to,
            int page,
            int size) {
    }

    private record FilteredQuery(String whereClause, Map<String, Object> parameters) {
    }
}
