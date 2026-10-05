package com.flowershop.inventory.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;

class LocalAdminInitializerTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final ApplicationArguments arguments = mock(ApplicationArguments.class);

    @Test
    void leavesExistingAdministratorUnchanged() {
        when(userRepository.findByUsername("admin"))
                .thenReturn(Optional.of(new AppUser(1, "admin", "hash", "ADMIN", true)));
        var initializer = new LocalAdminInitializer(
                userRepository, passwordEncoder, "admin", "replacement");

        initializer.run(arguments);

        verify(userRepository, never()).insertAdmin(anyString(), anyString());
        verifyNoInteractions(passwordEncoder);
    }

    @Test
    void requiresInitialPasswordWhenAdministratorDoesNotExist() {
        when(userRepository.findByUsername("admin")).thenReturn(Optional.empty());
        var initializer = new LocalAdminInitializer(
                userRepository, passwordEncoder, "admin", "  ");

        assertThatThrownBy(() -> initializer.run(arguments))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("APP_ADMIN_INITIAL_PASSWORD");

        verifyNoInteractions(passwordEncoder);
        verify(userRepository, never()).insertAdmin(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void hashesAndInsertsMissingAdministrator() {
        when(userRepository.findByUsername("admin")).thenReturn(Optional.empty());
        when(passwordEncoder.encode("secret")).thenReturn("encoded-secret");
        var initializer = new LocalAdminInitializer(
                userRepository, passwordEncoder, "admin", "secret");

        initializer.run(arguments);

        verify(passwordEncoder).encode("secret");
        verify(userRepository).insertAdmin("admin", "encoded-secret");
    }
}
