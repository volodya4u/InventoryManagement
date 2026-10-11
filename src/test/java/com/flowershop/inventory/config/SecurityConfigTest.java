package com.flowershop.inventory.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class SecurityConfigTest {

    // @trace NFR-2
    @Test
    void hashesPasswordsWithBcryptAtCostTwelve() {
        var encoder = new SecurityConfig().passwordEncoder();

        var hash = encoder.encode("a-password-for-the-test");

        assertThat(encoder).isInstanceOf(BCryptPasswordEncoder.class);
        assertThat(hash).startsWith("$2a$12$").doesNotContain("a-password-for-the-test");
        assertThat(encoder.matches("a-password-for-the-test", hash)).isTrue();
    }
}
