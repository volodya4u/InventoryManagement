package com.flowershop.inventory.auth;

public record AppUser(
        long id,
        String username,
        String passwordHash,
        String role,
        boolean enabled) {
}
