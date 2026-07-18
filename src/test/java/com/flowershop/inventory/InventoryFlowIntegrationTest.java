package com.flowershop.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.flowershop.inventory.auth.AuthController;
import com.flowershop.inventory.auth.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InventoryFlowIntegrationTest {

    private final String testPassword = UUID.randomUUID().toString();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void resetDatabase() {
        jdbcTemplate.update("DELETE FROM raw_material");
        jdbcTemplate.update("DELETE FROM product");
        jdbcTemplate.update("DELETE FROM app_user");
        userRepository.insertAdmin("admin", passwordEncoder.encode(testPassword));
    }

    @Test
    void authenticatesAdminAndStoresValidatedPngAsBlob() throws Exception {
        mockMvc.perform(get("/api/raw-materials"))
                .andExpect(status().isUnauthorized());

        var login = login(testPassword)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin"))
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andReturn();

        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();
        byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00};
        var image = new MockMultipartFile("image", "rose.png", "image/png", png);

        mockMvc.perform(multipart("/api/raw-materials")
                        .file(image)
                        .param("name", "Rose")
                        .param("description", "Rose")
                        .param("unit", "STEM")
                        .param("quantity", "12")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Rose"))
                .andExpect(jsonPath("$.hasImage").value(true));

        var imageResponse = mockMvc.perform(get("/api/raw-materials/1/image").session(session))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse();

        assertThat(imageResponse.getContentType()).isEqualTo("image/png");
        assertThat(imageResponse.getContentAsByteArray()).isEqualTo(png);
    }

    @Test
    void changesTheAuthenticatedAdminPasswordAndInvalidatesTheSession() throws Exception {
        var login = login(testPassword)
                .andExpect(status().isOk())
                .andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var newPassword = "Changed-" + UUID.randomUUID();
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        mockMvc.perform(post("/api/auth/change-password")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "currentPassword":"wrong-password",
                                  "newPassword":"%s",
                                  "newPasswordConfirmation":"%s"
                                }
                                """.formatted(newPassword, newPassword)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Current password is incorrect"));

        mockMvc.perform(post("/api/auth/change-password")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "currentPassword":"%s",
                                  "newPassword":"123456789",
                                  "newPasswordConfirmation":"123456789"
                                }
                                """.formatted(testPassword)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("New password must be between 10 and 64 characters"));

        var tooLongPassword = "x".repeat(65);
        mockMvc.perform(post("/api/auth/change-password")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "currentPassword":"%s",
                                  "newPassword":"%s",
                                  "newPasswordConfirmation":"%s"
                                }
                                """.formatted(testPassword, tooLongPassword, tooLongPassword)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("New password must be between 10 and 64 characters"));

        mockMvc.perform(post("/api/auth/change-password")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "currentPassword":"%s",
                                  "newPassword":"%s",
                                  "newPasswordConfirmation":"%s"
                                }
                                """.formatted(testPassword, newPassword, newPassword)))
                .andExpect(status().isNoContent());

        assertThat(session.isInvalid()).isTrue();
        login(testPassword).andExpect(status().isUnauthorized());
        login(newPassword).andExpect(status().isOk());
    }

    @Test
    void masksPasswordsInAuthenticationRequestLogs() {
        var loginRequest = new AuthController.LoginRequest("admin", "login-secret");
        var changeRequest = new AuthController.ChangePasswordRequest(
                "current-secret",
                "new-secret-value",
                "new-secret-value");

        assertThat(loginRequest.toString())
                .contains("[PROTECTED]")
                .doesNotContain("login-secret");
        assertThat(changeRequest.toString())
                .contains("[PROTECTED]")
                .doesNotContain("current-secret", "new-secret-value");
    }

    private ResultActions login(String password) throws Exception {
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        return mockMvc.perform(post("/api/auth/login")
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"username":"admin","password":"%s"}
                        """.formatted(password)));
    }
}
