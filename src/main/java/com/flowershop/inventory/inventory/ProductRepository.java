package com.flowershop.inventory.inventory;

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
public class ProductRepository {

    private static final String SUMMARY_COLUMNS = """
            id, sku, name, description, quantity, markup_percentage, price, average_unit_cost,
            image IS NOT NULL AS has_image, created_at, updated_at
            """;

    private final JdbcTemplate jdbcTemplate;

    public ProductRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ProductDto> findAll() {
        var products = jdbcTemplate.query(
                "SELECT " + SUMMARY_COLUMNS + " FROM product ORDER BY name COLLATE NOCASE",
                (rs, rowNum) -> map(rs, List.of()));
        return products.stream().map(this::withRecipe).toList();
    }

    public Optional<ProductDto> findById(long id) {
        return jdbcTemplate.query(
                        "SELECT " + SUMMARY_COLUMNS + " FROM product WHERE id = ?",
                        (rs, rowNum) -> map(rs, List.of()),
                        id)
                .stream()
                .findFirst()
                .map(this::withRecipe);
    }

    public long insert(
            String sku,
            String name,
            String description,
            BigDecimal quantity,
            BigDecimal markupPercentage,
            BigDecimal sellingPrice,
            BigDecimal averageUnitCost,
            ImagePayload image) {
        var keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(
                    """
                    INSERT INTO product
                        (sku, name, description, quantity, markup_percentage, price,
                         average_unit_cost, image, image_content_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, sku);
            statement.setString(2, name);
            statement.setString(3, description);
            statement.setBigDecimal(4, quantity);
            statement.setBigDecimal(5, markupPercentage);
            statement.setBigDecimal(6, sellingPrice);
            statement.setBigDecimal(7, averageUnitCost);
            statement.setBytes(8, image == null ? null : image.bytes());
            statement.setString(9, image == null ? null : image.contentType());
            return statement;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public int update(
            long id,
            String sku,
            String name,
            String description,
            BigDecimal markupPercentage,
            BigDecimal sellingPrice,
            ImagePayload image) {
        if (image == null) {
            return jdbcTemplate.update(
                    """
                    UPDATE product
                    SET sku = ?, name = ?, description = ?, markup_percentage = ?, price = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    sku,
                    name,
                    description,
                    markupPercentage,
                    sellingPrice,
                    id);
        }
        return jdbcTemplate.update(
                """
                UPDATE product
                SET sku = ?, name = ?, description = ?, markup_percentage = ?, price = ?,
                    image = ?, image_content_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                sku,
                name,
                description,
                markupPercentage,
                sellingPrice,
                image.bytes(),
                image.contentType(),
                id);
    }

    public void replaceRecipe(long productId, List<ProductRecipeItemInput> recipe) {
        jdbcTemplate.update("DELETE FROM product_recipe_item WHERE product_id = ?", productId);
        for (var item : recipe) {
            jdbcTemplate.update(
                    """
                    INSERT INTO product_recipe_item (product_id, raw_material_id, quantity_per_unit)
                    VALUES (?, ?, ?)
                    """,
                    productId,
                    item.rawMaterialId(),
                    item.quantityPerUnit());
        }
    }

    public int updateStock(long id, BigDecimal quantity, BigDecimal averageUnitCost) {
        return jdbcTemplate.update(
                """
                UPDATE product
                SET quantity = ?, average_unit_cost = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                quantity,
                averageUnitCost,
                id);
    }

    public int consumeStock(long id, BigDecimal quantity) {
        return jdbcTemplate.update(
                """
                UPDATE product
                SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND quantity >= ?
                """,
                quantity,
                id,
                quantity);
    }

    public long insertProductionBatch(
            long productId,
            BigDecimal quantity,
            BigDecimal unitCost,
            BigDecimal totalCost,
            LocalDate producedAt,
            String notes) {
        var keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(
                    """
                    INSERT INTO production_batch
                        (product_id, quantity, unit_cost, total_cost, produced_at, notes)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, productId);
            statement.setBigDecimal(2, quantity);
            statement.setBigDecimal(3, unitCost);
            statement.setBigDecimal(4, totalCost.setScale(2, RoundingMode.HALF_UP));
            statement.setString(5, producedAt.toString());
            statement.setString(6, notes);
            return statement;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public void insertProductionConsumption(
            long productionBatchId,
            long rawMaterialId,
            BigDecimal quantity,
            BigDecimal unitCost,
            BigDecimal totalCost) {
        jdbcTemplate.update(
                """
                INSERT INTO production_consumption
                    (production_batch_id, raw_material_id, quantity, unit_cost, total_cost)
                VALUES (?, ?, ?, ?, ?)
                """,
                productionBatchId,
                rawMaterialId,
                quantity,
                unitCost,
                totalCost.setScale(2, RoundingMode.HALF_UP));
    }

    public void insertStockMovement(
            long productId,
            Long productionBatchId,
            Long saleId,
            String movementType,
            BigDecimal quantity,
            BigDecimal unitCost,
            BigDecimal totalCost,
            LocalDate occurredAt,
            String notes) {
        jdbcTemplate.update(
                """
                INSERT INTO product_stock_movement
                    (product_id, production_batch_id, sale_id, movement_type, quantity,
                     unit_cost, total_cost, occurred_at, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                productId,
                productionBatchId,
                saleId,
                movementType,
                quantity,
                unitCost,
                totalCost.setScale(2, RoundingMode.HALF_UP),
                occurredAt.toString(),
                notes);
    }

    public Optional<StoredImage> findImage(long id) {
        return jdbcTemplate.query(
                        "SELECT image, image_content_type FROM product WHERE id = ? AND image IS NOT NULL",
                        (rs, rowNum) -> new StoredImage(
                                rs.getBytes("image"),
                                rs.getString("image_content_type")),
                        id)
                .stream()
                .findFirst();
    }

    public int delete(long id) {
        return jdbcTemplate.update("DELETE FROM product WHERE id = ?", id);
    }

    public long count() {
        Long value = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product", Long.class);
        return value == null ? 0L : value;
    }

    public BigDecimal totalQuantity() {
        BigDecimal value = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(quantity), 0) FROM product",
                BigDecimal.class);
        return value == null ? BigDecimal.ZERO : value;
    }

    private ProductDto withRecipe(ProductDto product) {
        return new ProductDto(
                product.id(),
                product.sku(),
                product.name(),
                product.description(),
                product.quantity(),
                product.markupPercentage(),
                product.sellingPrice(),
                product.averageUnitCost(),
                product.stockValue(),
                findRecipe(product.id()),
                product.hasImage(),
                product.createdAt(),
                product.updatedAt());
    }

    private List<ProductRecipeItemDto> findRecipe(long productId) {
        return jdbcTemplate.query(
                """
                SELECT recipe.raw_material_id, material.name, material.unit,
                       recipe.quantity_per_unit, material.quantity, material.average_unit_cost
                FROM product_recipe_item recipe
                JOIN raw_material material ON material.id = recipe.raw_material_id
                WHERE recipe.product_id = ?
                ORDER BY material.name COLLATE NOCASE
                """,
                (rs, rowNum) -> new ProductRecipeItemDto(
                        rs.getLong("raw_material_id"),
                        rs.getString("name"),
                        rs.getString("unit"),
                        rs.getBigDecimal("quantity_per_unit"),
                        rs.getBigDecimal("quantity"),
                        rs.getBigDecimal("average_unit_cost")),
                productId);
    }

    private ProductDto map(java.sql.ResultSet rs, List<ProductRecipeItemDto> recipe)
            throws java.sql.SQLException {
        var quantity = rs.getBigDecimal("quantity");
        var averageUnitCost = rs.getBigDecimal("average_unit_cost");
        return new ProductDto(
                rs.getLong("id"),
                rs.getString("sku"),
                rs.getString("name"),
                rs.getString("description"),
                quantity,
                rs.getBigDecimal("markup_percentage"),
                rs.getBigDecimal("price"),
                averageUnitCost,
                quantity.multiply(averageUnitCost).setScale(2, RoundingMode.HALF_UP),
                recipe,
                rs.getBoolean("has_image"),
                rs.getString("created_at"),
                rs.getString("updated_at"));
    }
}
