package com.flowershop.inventory.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@Profile("local")
public class LocalAdminInitializer implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String username;
    private final String initialPassword;

    public LocalAdminInitializer(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            @Value("${app.bootstrap.admin-username}") String username,
            @Value("${app.bootstrap.admin-password}") String initialPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.username = username;
        this.initialPassword = initialPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.findByUsername(username).isEmpty()) {
            if (initialPassword == null || initialPassword.isBlank()) {
                throw new IllegalStateException(
                        "APP_ADMIN_INITIAL_PASSWORD must be set when no administrator account exists");
            }
            userRepository.insertAdmin(username, passwordEncoder.encode(initialPassword));
        }
    }
}
