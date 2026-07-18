package com.flowershop.inventory.auth;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    private final JdbcTemplate jdbcTemplate;

    public UserRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<AppUser> findByUsername(String username) {
        return jdbcTemplate.query(
                        """
                        SELECT id, username, password_hash, role, enabled
                        FROM app_user
                        WHERE username = ? COLLATE NOCASE
                        """,
                        (rs, rowNum) -> new AppUser(
                                rs.getLong("id"),
                                rs.getString("username"),
                                rs.getString("password_hash"),
                                rs.getString("role"),
                                rs.getBoolean("enabled")),
                        username)
                .stream()
                .findFirst();
    }

    public void insertAdmin(String username, String passwordHash) {
        jdbcTemplate.update(
                "INSERT INTO app_user (username, password_hash, role, enabled) VALUES (?, ?, 'ADMIN', 1)",
                username,
                passwordHash);
    }
}
