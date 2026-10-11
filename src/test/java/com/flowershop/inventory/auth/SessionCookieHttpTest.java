package com.flowershop.inventory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

// A real embedded server on a random port: MockMvc has no servlet container, so only a real HTTP exchange shows the
// attributes the container puts on the session cookie. It has its own in-memory database, apart from the one the
// MockMvc tests share.
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:sqlite:file:session-cookie-test?mode=memory&cache=shared")
@ActiveProfiles("test")
class SessionCookieHttpTest {

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // @trace NFR-4
    @Test
    void sendsTheSessionCookieAsHttpOnlyAndSameSiteStrictWithoutTheSecureFlag() throws Exception {
        var password = UUID.randomUUID().toString();
        jdbcTemplate.update("DELETE FROM app_user");
        userRepository.insertAdmin("admin", passwordEncoder.encode(password));
        var client = HttpClient.newHttpClient();
        var base = "http://localhost:" + port;

        var csrf = client.send(
                HttpRequest.newBuilder(URI.create(base + "/api/auth/csrf")).GET().build(),
                BodyHandlers.ofString());
        var token = cookieValue(csrf, "XSRF-TOKEN");

        var login = client.send(
                HttpRequest.newBuilder(URI.create(base + "/api/auth/login"))
                        .header("Content-Type", "application/json")
                        .header("Cookie", "XSRF-TOKEN=" + token)
                        .header("X-XSRF-TOKEN", token)
                        .POST(BodyPublishers.ofString(
                                "{\"username\":\"admin\",\"password\":\"%s\"}".formatted(password)))
                        .build(),
                BodyHandlers.ofString());

        assertThat(login.statusCode()).isEqualTo(200);
        var sessionCookie = login.headers().allValues("Set-Cookie").stream()
                .filter(header -> header.startsWith("JSESSIONID="))
                .findFirst()
                .orElseThrow();
        assertThat(sessionCookie).contains("HttpOnly").contains("SameSite=Strict").doesNotContain("Secure");
    }

    private static String cookieValue(HttpResponse<?> response, String name) {
        return response.headers().allValues("Set-Cookie").stream()
                .filter(header -> header.startsWith(name + "="))
                .map(header -> header.substring(name.length() + 1, header.indexOf(';')))
                .findFirst()
                .orElseThrow();
    }
}
