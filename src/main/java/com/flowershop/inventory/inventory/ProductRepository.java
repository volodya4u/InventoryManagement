package com.flowershop.inventory.inventory;

import com.flowershop.inventory.image.ImagePayload;
import com.flowershop.inventory.image.StoredImage;
import java.math.BigDecimal;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class ProductRepository {

    private static final String SUMMARY_COLUMNS = """
            id, sku, name, description, quantity, price,
            image IS NOT NULL AS has_image, created_at, updated_at
            """;

    private final JdbcTemplate jdbcTemplate;

    public ProductRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ProductDto> findAll() {
        return jdbcTemplate.query(
                "SELECT " + SUMMARY_COLUMNS + " FROM product ORDER BY name COLLATE NOCASE",
                (rs, rowNum) -> map(rs));
    }

    public Optional<ProductDto> findById(long id) {
        return jdbcTemplate.query(
                        "SELECT " + SUMMARY_COLUMNS + " FROM product WHERE id = ?",
                        (rs, rowNum) -> map(rs),
                        id)
                .stream()
                .findFirst();
    }

    public long insert(
            String sku,
            String name,
            String description,
            BigDecimal quantity,
            BigDecimal price,
            ImagePayload image) {
        var keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(
                    """
                    INSERT INTO product
                        (sku, name, description, quantity, price, image, image_content_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, sku);
            statement.setString(2, name);
            statement.setString(3, description);
            statement.setBigDecimal(4, quantity);
            statement.setBigDecimal(5, price);
            statement.setBytes(6, image == null ? null : image.bytes());
            statement.setString(7, image == null ? null : image.contentType());
            return statement;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public int update(
            long id,
            String sku,
            String name,
            String description,
            BigDecimal quantity,
            BigDecimal price,
            ImagePayload image) {
        if (image == null) {
            return jdbcTemplate.update(
                    """
                    UPDATE product
                    SET sku = ?, name = ?, description = ?, quantity = ?, price = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    sku,
                    name,
                    description,
                    quantity,
                    price,
                    id);
        }
        return jdbcTemplate.update(
                """
                UPDATE product
                SET sku = ?, name = ?, description = ?, quantity = ?, price = ?,
                    image = ?, image_content_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                sku,
                name,
                description,
                quantity,
                price,
                image.bytes(),
                image.contentType(),
                id);
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

    private ProductDto map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ProductDto(
                rs.getLong("id"),
                rs.getString("sku"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getBigDecimal("quantity"),
                rs.getBigDecimal("price"),
                rs.getBoolean("has_image"),
                rs.getString("created_at"),
                rs.getString("updated_at"));
    }
}
