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
public class RawMaterialRepository {

    private static final String SUMMARY_COLUMNS = """
            id, name, description, unit, quantity,
            image IS NOT NULL AS has_image, created_at, updated_at
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
            ImagePayload image) {
        var keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(
                    """
                    INSERT INTO raw_material
                        (name, description, unit, quantity, image, image_content_type)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, name);
            statement.setString(2, description);
            statement.setString(3, unit.name());
            statement.setBigDecimal(4, quantity);
            statement.setBytes(5, image == null ? null : image.bytes());
            statement.setString(6, image == null ? null : image.contentType());
            return statement;
        }, keyHolder);
        return keyHolder.getKey().longValue();
    }

    public int update(
            long id,
            String name,
            String description,
            MeasurementUnit unit,
            BigDecimal quantity,
            ImagePayload image) {
        if (image == null) {
            return jdbcTemplate.update(
                    """
                    UPDATE raw_material
                    SET name = ?, description = ?, unit = ?, quantity = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    name,
                    description,
                    unit.name(),
                    quantity,
                    id);
        }
        return jdbcTemplate.update(
                """
                UPDATE raw_material
                SET name = ?, description = ?, unit = ?, quantity = ?,
                    image = ?, image_content_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                name,
                description,
                unit.name(),
                quantity,
                image.bytes(),
                image.contentType(),
                id);
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

    public int delete(long id) {
        return jdbcTemplate.update("DELETE FROM raw_material WHERE id = ?", id);
    }

    public long count() {
        Long value = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM raw_material", Long.class);
        return value == null ? 0L : value;
    }

    private RawMaterialDto map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new RawMaterialDto(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getString("unit"),
                rs.getBigDecimal("quantity"),
                rs.getBoolean("has_image"),
                rs.getString("created_at"),
                rs.getString("updated_at"));
    }
}
