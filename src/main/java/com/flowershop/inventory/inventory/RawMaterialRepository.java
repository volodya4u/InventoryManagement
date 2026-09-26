package com.flowershop.inventory.inventory;

import com.flowershop.inventory.common.SqliteDecimals;
import com.flowershop.inventory.image.ImagePayload;
import com.flowershop.inventory.image.StoredImage;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class RawMaterialRepository {

    // The unit may only change while nothing is recorded in it yet: no stock, no stock history,
    // and no product recipe quantities.
    private static final String SUMMARY_COLUMNS = """
            id, name, description, unit, quantity,
            average_unit_cost,
            image IS NOT NULL AS has_image,
            quantity = 0
                AND NOT EXISTS (
                    SELECT 1 FROM raw_material_stock_movement movement
                    WHERE movement.raw_material_id = raw_material.id)
                AND NOT EXISTS (
                    SELECT 1 FROM product_recipe_item recipe
                    WHERE recipe.raw_material_id = raw_material.id) AS unit_changeable,
            created_at, updated_at
            """;

    private final JdbcTemplate jdbcTemplate;

    public RawMaterialRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<RawMaterialDto> findAll() {
        return jdbcTemplate.query(
                "SELECT " + SUMMARY_COLUMNS + " FROM raw_material ORDER BY name COLLATE NOCASE",
                (rs, rowNum) -> map(rs));
    }

    public Optional<RawMaterialDto> findById(long id) {
        return jdbcTemplate.query(
                        "SELECT " + SUMMARY_COLUMNS + " FROM raw_material WHERE id = ?",
                        (rs, rowNum) -> map(rs),
                        id)
                .stream()
                .findFirst();
    }

    public long insert(
            String name,
            String description,
            MeasurementUnit unit,
            BigDecimal quantity,
            BigDecimal averageUnitCost,
            ImagePayload image) {
        var keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(
                    """
                    INSERT INTO raw_material
                        (name, description, unit, quantity, average_unit_cost, image, image_content_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, name);
            statement.setString(2, description);
            statement.setString(3, unit.name());
            statement.setBigDecimal(4, quantity);
            statement.setBigDecimal(5, averageUnitCost);
            statement.setBytes(6, image == null ? null : image.bytes());
            statement.setString(7, image == null ? null : image.contentType());
            return statement;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public int update(
            long id,
            String name,
            String description,
            MeasurementUnit unit,
            ImagePayload image) {
        if (image == null) {
            return jdbcTemplate.update(
                    """
                    UPDATE raw_material
                    SET name = ?, description = ?, unit = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    name,
                    description,
                    unit.name(),
                    id);
        }
        return jdbcTemplate.update(
                """
                UPDATE raw_material
                SET name = ?, description = ?, unit = ?,
                    image = ?, image_content_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                name,
                description,
                unit.name(),
                image.bytes(),
                image.contentType(),
                id);
    }

    public int updateStock(long id, BigDecimal quantity, BigDecimal averageUnitCost) {
        return jdbcTemplate.update(
                """
                UPDATE raw_material
                SET quantity = ?, average_unit_cost = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                quantity,
                averageUnitCost,
                id);
    }

    public int consumeStock(long id, BigDecimal quantity) {
        return StockQuantities.consume(jdbcTemplate, "raw_material", id, quantity);
    }

    public void insertStockMovement(
            long rawMaterialId,
            String movementType,
            BigDecimal quantity,
            BigDecimal unitCost,
            BigDecimal totalCost,
            LocalDate occurredAt,
            String notes) {
        jdbcTemplate.update(
                """
                INSERT INTO raw_material_stock_movement
                    (raw_material_id, movement_type, quantity, unit_cost, total_cost, occurred_at, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                rawMaterialId,
                movementType,
                quantity,
                unitCost,
                totalCost.setScale(2, RoundingMode.HALF_UP),
                occurredAt.toString(),
                notes);
    }

    public Optional<StoredImage> findImage(long id) {
        return jdbcTemplate.query(
                        "SELECT image, image_content_type FROM raw_material WHERE id = ? AND image IS NOT NULL",
                        (rs, rowNum) -> new StoredImage(
                                rs.getBytes("image"),
                                rs.getString("image_content_type")),
                        id)
                .stream()
                .findFirst();
    }

    public List<String> findRecipeProductNames(long id) {
        return jdbcTemplate.queryForList(
                """
                SELECT product.name
                FROM product_recipe_item recipe
                JOIN product ON product.id = recipe.product_id
                WHERE recipe.raw_material_id = ?
                ORDER BY product.name COLLATE NOCASE
                """,
                String.class,
                id);
    }

    public boolean hasProductionConsumption(long id) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM production_consumption WHERE raw_material_id = ?)",
                Boolean.class,
                id));
    }

    public int delete(long id) {
        return jdbcTemplate.update("DELETE FROM raw_material WHERE id = ?", id);
    }

    public long count() {
        Long value = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM raw_material", Long.class);
        return value == null ? 0L : value;
    }

    private RawMaterialDto map(java.sql.ResultSet rs) throws java.sql.SQLException {
        var quantity = SqliteDecimals.read(rs, "quantity");
        var averageUnitCost = SqliteDecimals.read(rs, "average_unit_cost");
        return new RawMaterialDto(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getString("unit"),
                quantity,
                averageUnitCost,
                quantity.multiply(averageUnitCost).setScale(2, RoundingMode.HALF_UP),
                rs.getBoolean("has_image"),
                rs.getBoolean("unit_changeable"),
                rs.getString("created_at"),
                rs.getString("updated_at"));
    }
}
