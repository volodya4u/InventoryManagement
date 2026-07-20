package com.flowershop.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.flowershop.inventory.auth.AuthController;
import com.flowershop.inventory.auth.UserRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
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
        jdbcTemplate.update("DELETE FROM product");
        jdbcTemplate.update("DELETE FROM raw_material");
        jdbcTemplate.update("DELETE FROM app_user");
        jdbcTemplate.update("""
                DELETE FROM sqlite_sequence
                WHERE name IN (
                    'raw_material', 'raw_material_stock_movement', 'product',
                    'production_batch', 'production_consumption', 'product_stock_movement'
                )
                """);
        userRepository.insertAdmin("admin", passwordEncoder.encode(testPassword));
    }

    @Test
    void producesAProductAtomicallyFromItsRawMaterialRecipe() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        createRawMaterial(session, csrfCookie, "Rose", "PIECE", "12", "20");
        createRawMaterial(session, csrfCookie, "Ribbon", "METER", "1", "10");
        createRawMaterial(session, csrfCookie, "Gift Box", "PIECE", "5", "30");

        var recipe = new MockMultipartFile(
                "recipe",
                "recipe.json",
                MediaType.APPLICATION_JSON_VALUE,
                """
                [
                  {"rawMaterialId":1,"quantityPerUnit":5},
                  {"rawMaterialId":2,"quantityPerUnit":0.8},
                  {"rawMaterialId":3,"quantityPerUnit":1}
                ]
                """.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/products")
                        .file(recipe)
                        .param("sku", "ROSE-BOX-001")
                        .param("name", "Rose Box")
                        .param("description", "Gift box with roses")
                        .param("quantity", "2")
                        .param("initialUnitCost", "100")
                        .param("price", "250")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.averageUnitCost").value(100))
                .andExpect(jsonPath("$.stockValue").value(200))
                .andExpect(jsonPath("$.recipe.length()").value(3));

        assertMaterialQuantity("Rose", "12");
        assertMaterialQuantity("Ribbon", "1");
        assertMaterialQuantity("Gift Box", "5");

        mockMvc.perform(post("/api/products/1/production")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "quantity": 2,
                                  "productionDate": "2026-07-21",
                                  "notes": "Attempt with insufficient ribbon"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Insufficient raw material stock"))
                .andExpect(jsonPath("$.shortages[0].rawMaterialName").value("Ribbon"))
                .andExpect(jsonPath("$.shortages[0].missingQuantity").value(0.6));

        assertMaterialQuantity("Rose", "12");
        assertMaterialQuantity("Ribbon", "1");
        assertMaterialQuantity("Gift Box", "5");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("2");

        mockMvc.perform(post("/api/products/1/production")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "quantity": 1,
                                  "productionDate": "2026-07-21",
                                  "notes": "First production batch"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(3))
                .andExpect(jsonPath("$.averageUnitCost").value(112.6667))
                .andExpect(jsonPath("$.stockValue").value(338.0));

        assertMaterialQuantity("Rose", "7");
        assertMaterialQuantity("Ribbon", "0.2");
        assertMaterialQuantity("Gift Box", "4");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM production_batch", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM production_consumption", Integer.class)).isEqualTo(3);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement", Integer.class)).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM raw_material_stock_movement
                WHERE movement_type = 'PRODUCTION_CONSUMPTION'
                """,
                Integer.class)).isEqualTo(3);
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
                        .param("unit", "PIECE")
                        .param("quantity", "12")
                        .param("initialUnitCost", "12.50")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Rose"))
                .andExpect(jsonPath("$.averageUnitCost").value(12.5))
                .andExpect(jsonPath("$.stockValue").value(150.0))
                .andExpect(jsonPath("$.hasImage").value(true));

        var imageResponse = mockMvc.perform(get("/api/raw-materials/1/image").session(session))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse();

        assertThat(imageResponse.getContentType()).isEqualTo("image/png");
        assertThat(imageResponse.getContentAsByteArray()).isEqualTo(png);

        mockMvc.perform(post("/api/raw-materials/1/receipts")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "receivedQuantity": 8,
                                  "unitPurchaseCost": 20,
                                  "receiptDate": "2026-07-19",
                                  "notes": "Second delivery"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(20))
                .andExpect(jsonPath("$.averageUnitCost").value(15.5))
                .andExpect(jsonPath("$.stockValue").value(310.0));

        Integer movements = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM raw_material_stock_movement WHERE raw_material_id = 1",
                Integer.class);
        assertThat(movements).isEqualTo(2);
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

    private void createRawMaterial(
            MockHttpSession session,
            jakarta.servlet.http.Cookie csrfCookie,
            String name,
            String unit,
            String quantity,
            String initialUnitCost) throws Exception {
        mockMvc.perform(multipart("/api/raw-materials")
                        .param("name", name)
                        .param("description", "")
                        .param("unit", unit)
                        .param("quantity", quantity)
                        .param("initialUnitCost", initialUnitCost)
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isCreated());
    }

    private void assertMaterialQuantity(String name, String expected) {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM raw_material WHERE name = ?",
                BigDecimal.class,
                name)).isEqualByComparingTo(expected);
    }
}
