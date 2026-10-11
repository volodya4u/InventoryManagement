package com.flowershop.inventory.image;

import static org.assertj.core.api.Assertions.assertThat;

import com.flowershop.inventory.auth.UserRepository;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

// A real embedded server on a random port: the multipart limits (spring.servlet.multipart.max-file-size 2MB and
// max-request-size 3MB) are enforced by the servlet container, which MockMvc does not have. It has its own in-memory
// database, apart from the one the MockMvc tests share.
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:sqlite:file:image-upload-limit-test?mode=memory&cache=shared")
@ActiveProfiles("test")
class ImageUploadLimitHttpTest {

    private static final int TWO_MEGABYTES = 2 * 1024 * 1024;
    private static final String BOUNDARY = "----imageUploadLimitBoundary";

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final HttpClient client = HttpClient.newHttpClient();
    private String base;
    private String sessionCookie;
    private String csrfToken;

    @BeforeEach
    void signIn() throws Exception {
        base = "http://localhost:" + port;
        var password = UUID.randomUUID().toString();
        jdbcTemplate.update("DELETE FROM raw_material");
        jdbcTemplate.update("DELETE FROM app_user");
        userRepository.insertAdmin("admin", passwordEncoder.encode(password));

        var anonymousCsrf = send(HttpRequest.newBuilder(URI.create(base + "/api/auth/csrf")).GET());
        var anonymousToken = cookieValue(anonymousCsrf, "XSRF-TOKEN");
        var login = send(HttpRequest.newBuilder(URI.create(base + "/api/auth/login"))
                .header("Content-Type", "application/json")
                .header("Cookie", "XSRF-TOKEN=" + anonymousToken)
                .header("X-XSRF-TOKEN", anonymousToken)
                .POST(BodyPublishers.ofString(
                        "{\"username\":\"admin\",\"password\":\"%s\"}".formatted(password))));
        assertThat(login.statusCode()).isEqualTo(200);
        sessionCookie = "JSESSIONID=" + cookieValue(login, "JSESSIONID");

        var csrf = send(HttpRequest.newBuilder(URI.create(base + "/api/auth/csrf"))
                .header("Cookie", sessionCookie)
                .GET());
        csrfToken = cookieValue(csrf, "XSRF-TOKEN");
    }

    // @trace FR-72
    @Test
    void acceptsAnImageOfExactlyTwoMegabytes() throws Exception {
        var response = uploadRawMaterial(png(TWO_MEGABYTES), null);

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains("\"hasImage\":true");
    }

    // @trace FR-72
    @Test
    void answers413WhenAFileIsOverTwoMegabytes() throws Exception {
        var response = uploadRawMaterial(png(TWO_MEGABYTES + 1), null);

        // Spring's own problem detail answers, not the "File too large" handler in ApiExceptionHandler.
        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.body())
                .contains("\"title\":\"Content Too Large\"")
                .contains("\"detail\":\"Maximum upload size exceeded\"");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM raw_material", Integer.class)).isZero();
    }

    // @trace FR-72
    @Test
    void refusesARequestOverThreeMegabytesAndStoresNothing() throws Exception {
        // Each file is under the 2 MB file limit; together they are over the 3 MB request limit.
        try {
            var response = uploadRawMaterial(png(1_700_000), new byte[1_700_000]);

            assertThat(response.statusCode()).isEqualTo(413);
        } catch (IOException exception) {
            // The container rejects an oversized body from its Content-Length and may close the connection before
            // the client can read the 413 (the body is larger than the container will drain), so the refusal is
            // sometimes seen only as a failed exchange.
        }
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM raw_material", Integer.class)).isZero();
    }

    private HttpResponse<String> uploadRawMaterial(byte[] image, byte[] extraFile) throws Exception {
        var fields = new LinkedHashMap<String, String>();
        fields.put("name", "Rose");
        fields.put("description", "");
        fields.put("unit", "PIECE");
        fields.put("quantity", "1");
        fields.put("initialUnitCost", "1");

        var body = new ByteArrayOutputStream();
        for (var field : fields.entrySet()) {
            body.writeBytes(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n"
                    .formatted(BOUNDARY, field.getKey(), field.getValue())).getBytes(StandardCharsets.UTF_8));
        }
        filePart(body, "image", "rose.png", "image/png", image);
        if (extraFile != null) {
            filePart(body, "attachment", "extra.bin", "application/octet-stream", extraFile);
        }
        body.writeBytes(("--%s--\r\n".formatted(BOUNDARY)).getBytes(StandardCharsets.UTF_8));

        return send(HttpRequest.newBuilder(URI.create(base + "/api/raw-materials"))
                .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                .header("Cookie", sessionCookie + "; XSRF-TOKEN=" + csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .POST(BodyPublishers.ofByteArray(body.toByteArray())));
    }

    private static void filePart(ByteArrayOutputStream body, String name, String filename, String contentType, byte[] bytes) {
        body.writeBytes(("--%s\r\nContent-Disposition: form-data; name=\"%s\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n"
                .formatted(BOUNDARY, name, filename, contentType)).getBytes(StandardCharsets.UTF_8));
        body.writeBytes(bytes);
        body.writeBytes("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    /** A PNG-signed byte array of the given size. */
    private static byte[] png(int size) {
        var bytes = new byte[size];
        byte[] signature = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        System.arraycopy(signature, 0, bytes, 0, signature.length);
        return bytes;
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return client.send(request.build(), BodyHandlers.ofString());
    }

    private static String cookieValue(HttpResponse<?> response, String name) {
        return response.headers().allValues("Set-Cookie").stream()
                .filter(header -> header.startsWith(name + "="))
                .map(header -> header.substring(name.length() + 1, header.indexOf(';')))
                .findFirst()
                .orElseThrow();
    }
}
