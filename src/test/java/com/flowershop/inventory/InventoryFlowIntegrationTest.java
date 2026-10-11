package com.flowershop.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.SoftAssertions.assertSoftly;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import com.flowershop.inventory.auth.AuthController;
import com.flowershop.inventory.auth.UserRepository;
import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
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

    @Value("${server.servlet.session.timeout}")
    private String sessionTimeout;

    @Value("${server.error.include-message}")
    private String errorIncludeMessage;

    @Value("${server.error.include-stacktrace}")
    private String errorIncludeStacktrace;

    @BeforeEach
    void resetDatabase() {
        jdbcTemplate.update("DELETE FROM product_stock_movement");
        jdbcTemplate.update("DELETE FROM sale_return");
        jdbcTemplate.update("DELETE FROM sale");
        jdbcTemplate.update("DELETE FROM product");
        jdbcTemplate.update("DELETE FROM raw_material");
        jdbcTemplate.update("DELETE FROM app_user");
        jdbcTemplate.update("""
                DELETE FROM sqlite_sequence
                WHERE name IN (
                    'raw_material', 'raw_material_stock_movement', 'product',
                    'production_batch', 'production_consumption', 'product_stock_movement',
                    'sale', 'sale_item', 'sale_return', 'sale_return_item'
                )
                """);
        userRepository.insertAdmin("admin", passwordEncoder.encode(testPassword));
    }

    // @trace FR-101, FR-104, FR-105, FR-106, NFR-12
    @Test
    void sellsProductsAtomicallyAndKeepsFinancialSnapshots() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        jdbcTemplate.update("""
                INSERT INTO product
                    (sku, name, description, quantity, price, markup_percentage, average_unit_cost)
                VALUES ('ROSE-BOX-001', 'Rose Box', '', 5, 250, 50, 150)
                """);

        mockMvc.perform(post("/api/sales")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "saleDate": "2026-07-21",
                                  "paymentMethod": "CASH",
                                  "notes": "Insufficient attempt",
                                  "items": [{"productId": 1, "quantity": 6, "unitPrice": 240}]
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Insufficient product stock"))
                .andExpect(jsonPath("$.shortages[0].productSku").value("ROSE-BOX-001"))
                .andExpect(jsonPath("$.shortages[0].missingQuantity").value(1));

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sale", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("5");

        mockMvc.perform(post("/api/sales")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "saleDate": "2026-07-21",
                                  "paymentMethod": "CARD",
                                  "notes": "Customer price",
                                  "items": [{"productId": 1, "quantity": 2, "unitPrice": 240}]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.saleNumber").value("SALE-20260721-0001"))
                .andExpect(jsonPath("$.paymentMethod").value("CARD"))
                .andExpect(jsonPath("$.totalRevenue").value(480))
                .andExpect(jsonPath("$.totalCost").value(300))
                .andExpect(jsonPath("$.grossProfit").value(180))
                .andExpect(jsonPath("$.items[0].recommendedUnitPrice").value(250))
                .andExpect(jsonPath("$.items[0].unitPrice").value(240))
                .andExpect(jsonPath("$.items[0].unitCost").value(150));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("3");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sale_item", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement WHERE movement_type = 'SALE'",
                Integer.class)).isEqualTo(1);

        mockMvc.perform(get("/api/sales").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].items[0].productName").value("Rose Box"));
        mockMvc.perform(get("/api/dashboard").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salesCount").value(1));
    }

    // @trace FR-108, FR-111, FR-115, FR-119, FR-121, FR-122, FR-123, FR-124, FR-137, FR-138, FR-139, FR-140
    @Test
    void returnsAndCancelsSalesWhileRestoringStockAndMonthlyResults() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        jdbcTemplate.update("""
                INSERT INTO product
                    (sku, name, description, quantity, price, markup_percentage, average_unit_cost)
                VALUES ('ROSE-BOX-001', 'Rose Box', '', 10, 200, 100, 100)
                """);

        mockMvc.perform(post("/api/sales")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "saleDate": "2026-07-20",
                                  "paymentMethod": "CARD",
                                  "notes": "Return scenario",
                                  "items": [{"productId": 1, "quantity": 4, "unitPrice": 200}]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.items[0].id").value(1))
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        mockMvc.perform(post("/api/sales/1/returns")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "returnDate": "2026-08-02",
                                  "reason": "Customer Return",
                                  "notes": "Unopened item",
                                  "items": [{"saleItemId": 1, "quantity": 1}]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PARTIALLY_RETURNED"))
                .andExpect(jsonPath("$.items[0].returnedQuantity").value(1))
                .andExpect(jsonPath("$.refundedRevenue").value(200))
                .andExpect(jsonPath("$.returnedCost").value(100))
                .andExpect(jsonPath("$.netRevenue").value(600))
                .andExpect(jsonPath("$.netGrossProfit").value(300))
                .andExpect(jsonPath("$.returns[0].returnNumber").value("RET-20260802-0001"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("7");

        mockMvc.perform(post("/api/sales/1/returns")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "returnDate": "2026-08-02",
                                  "reason": "Invalid Excess Return",
                                  "items": [{"saleItemId": 1, "quantity": 4}]
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(
                        "Return quantity for Rose Box exceeds the remaining returnable quantity 3"));

        mockMvc.perform(post("/api/sales/1/returns")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "returnDate": "2026-08-03",
                                  "reason": "Customer Return",
                                  "items": [{"saleItemId": 1, "quantity": 3}]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RETURNED"))
                .andExpect(jsonPath("$.items[0].returnedQuantity").value(4))
                .andExpect(jsonPath("$.netRevenue").value(0))
                .andExpect(jsonPath("$.netCost").value(0));

        mockMvc.perform(post("/api/sales")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "saleDate": "2026-07-21",
                                  "paymentMethod": "CASH",
                                  "items": [{"productId": 1, "quantity": 2, "unitPrice": 200}]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(2));

        mockMvc.perform(post("/api/sales/2/cancellation")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "cancellationDate": "2026-08-04",
                                  "reason": "Entry Error",
                                  "notes": "Duplicate document"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.returns[0].operationType").value("CANCELLATION"))
                .andExpect(jsonPath("$.netRevenue").value(0));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("10");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT average_unit_cost FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("100");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement WHERE movement_type = 'SALE_RETURN'",
                Integer.class)).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement WHERE movement_type = 'SALE_CANCELLATION'",
                Integer.class)).isEqualTo(1);

        mockMvc.perform(get("/api/reports/monthly-sales")
                        .param("month", "2026-08")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salesCount").value(0))
                .andExpect(jsonPath("$.returnCount").value(3))
                .andExpect(jsonPath("$.unitsSold").value(-6))
                .andExpect(jsonPath("$.unitsReturned").value(6))
                .andExpect(jsonPath("$.grossRevenue").value(0))
                .andExpect(jsonPath("$.refunds").value(1200))
                .andExpect(jsonPath("$.revenue").value(-1200))
                .andExpect(jsonPath("$.returnedCost").value(600))
                .andExpect(jsonPath("$.totalCost").value(-600))
                .andExpect(jsonPath("$.grossProfit").value(-600))
                .andExpect(jsonPath("$.returns.length()").value(3));
    }

    // @trace FR-120
    @Test
    void reversesTheWholeRecordedCostWhenUnitsAreReturnedOneByOne() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        jdbcTemplate.update("""
                INSERT INTO product
                    (sku, name, description, quantity, price, markup_percentage, average_unit_cost)
                VALUES ('MOSS-BOX-001', 'Moss Box', '', 3, 1, 0, 0.3333)
                """);
        mockMvc.perform(post("/api/sales")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "saleDate": "2026-07-20",
                                  "paymentMethod": "CASH",
                                  "items": [{"productId": 1, "quantity": 3, "unitPrice": 1}]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.totalCost").value(1.0))
                .andExpect(jsonPath("$.grossProfit").value(2.0));

        for (int returned = 1; returned <= 3; returned++) {
            mockMvc.perform(post("/api/sales/1/returns")
                            .session(session)
                            .cookie(csrfCookie)
                            .header("X-XSRF-TOKEN", csrfCookie.getValue())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "returnDate": "2026-07-21",
                                      "reason": "Customer Return",
                                      "items": [{"saleItemId": 1, "quantity": 1}]
                                    }
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].returnedQuantity").value(returned));
        }

        assertThat(jdbcTemplate.queryForList(
                "SELECT line_cost FROM sale_return_item ORDER BY id", BigDecimal.class))
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("0.33"), new BigDecimal("0.34"), new BigDecimal("0.33"));
        mockMvc.perform(get("/api/sales/1").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RETURNED"))
                .andExpect(jsonPath("$.returnedCost").value(1.0))
                .andExpect(jsonPath("$.netRevenue").value(0))
                .andExpect(jsonPath("$.netCost").value(0))
                .andExpect(jsonPath("$.netGrossProfit").value(0));
        mockMvc.perform(get("/api/reports/monthly-sales").param("month", "2026-07").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revenue").value(0))
                .andExpect(jsonPath("$.totalCost").value(0))
                .andExpect(jsonPath("$.grossProfit").value(0));
    }

    // @trace FR-136, FR-137, FR-138, FR-142
    @Test
    void reportsMonthlySalesWithoutMixingOtherMonths() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);

        jdbcTemplate.update("""
                INSERT INTO product
                    (sku, name, description, quantity, price, markup_percentage, average_unit_cost)
                VALUES ('ROSE-BOX-001', 'Rose Box', '', 10, 250, 50, 150)
                """);
        insertSale("SALE-20260705-0001", "2026-07-05", "CARD", "480", "300", "180", "2", "240");
        insertSale("SALE-20260720-0001", "2026-07-20", "CASH", "250", "150", "100", "1", "250");
        insertSale("SALE-20260630-0001", "2026-06-30", "BANK_TRANSFER", "100", "50", "50", "1", "100");

        mockMvc.perform(get("/api/reports/monthly-sales")
                        .param("month", "2026-07")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.month").value("2026-07"))
                .andExpect(jsonPath("$.periodStart").value("2026-07-01"))
                .andExpect(jsonPath("$.periodEnd").value("2026-07-31"))
                .andExpect(jsonPath("$.salesCount").value(2))
                .andExpect(jsonPath("$.unitsSold").value(3))
                .andExpect(jsonPath("$.revenue").value(730))
                .andExpect(jsonPath("$.totalCost").value(450))
                .andExpect(jsonPath("$.grossProfit").value(280))
                .andExpect(jsonPath("$.averageSaleValue").value(365))
                .andExpect(jsonPath("$.paymentSummaries.length()").value(3))
                .andExpect(jsonPath("$.paymentSummaries[0].paymentMethod").value("CASH"))
                .andExpect(jsonPath("$.paymentSummaries[0].salesCount").value(1))
                .andExpect(jsonPath("$.paymentSummaries[1].paymentMethod").value("CARD"))
                .andExpect(jsonPath("$.paymentSummaries[2].paymentMethod").value("BANK_TRANSFER"))
                .andExpect(jsonPath("$.paymentSummaries[2].revenue").value(0))
                .andExpect(jsonPath("$.dailySummaries.length()").value(2))
                .andExpect(jsonPath("$.productSummaries[0].quantitySold").value(3))
                .andExpect(jsonPath("$.productSummaries[0].grossProfit").value(280))
                .andExpect(jsonPath("$.sales.length()").value(2));

        mockMvc.perform(get("/api/reports/monthly-sales")
                        .param("month", "July 2026")
                        .session(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Month must use the YYYY-MM format"));
    }

    @Test
    void forwardsNestedReportRoutesToTheAngularApplication() throws Exception {
        mockMvc.perform(get("/reports/monthly-sales"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void forwardsTheStockHistoryRouteToTheAngularApplication() throws Exception {
        mockMvc.perform(get("/stock-movements"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));
    }

    // @trace FR-36
    @Test
    void reportsHealthWithoutSigningInOrCreatingASession() throws Exception {
        var result = mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
    }

    // @trace FR-64, FR-65, FR-66, FR-95, FR-96
    @Test
    void writesOffAndAdjustsRawMaterialAndProductStock() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        jdbcTemplate.update("""
                INSERT INTO raw_material
                    (name, description, unit, quantity, average_unit_cost)
                VALUES ('Rose', '', 'PIECE', 10, 20)
                """);
        jdbcTemplate.update("""
                INSERT INTO product
                    (sku, name, description, quantity, price, markup_percentage, average_unit_cost)
                VALUES ('ROSE-BOX-001', 'Rose Box', '', 5, 250, 50, 150)
                """);

        mockMvc.perform(post("/api/raw-materials/1/write-offs")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "quantity": 2.5,
                                  "operationDate": "2026-07-21",
                                  "reason": "Damaged",
                                  "notes": "Water damage"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(7.5))
                .andExpect(jsonPath("$.averageUnitCost").value(20))
                .andExpect(jsonPath("$.stockValue").value(150));

        mockMvc.perform(post("/api/raw-materials/1/write-offs")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "quantity": 8,
                                  "operationDate": "2026-07-21",
                                  "reason": "Damaged"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Insufficient raw material stock"));

        mockMvc.perform(post("/api/raw-materials/1/adjustments")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "actualQuantity": 9,
                                  "operationDate": "2026-07-21",
                                  "reason": "Physical Inventory Count"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(9))
                .andExpect(jsonPath("$.stockValue").value(180));

        mockMvc.perform(post("/api/raw-materials/1/adjustments")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "actualQuantity": 4,
                                  "operationDate": "2026-07-21",
                                  "reason": "Physical Inventory Count"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(4));

        mockMvc.perform(post("/api/products/1/write-offs")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "quantity": 2,
                                  "operationDate": "2026-07-21",
                                  "reason": "Unsellable"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(3))
                .andExpect(jsonPath("$.averageUnitCost").value(150))
                .andExpect(jsonPath("$.stockValue").value(450));

        mockMvc.perform(post("/api/products/1/write-offs")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "quantity": 4,
                                  "operationDate": "2026-07-21",
                                  "reason": "Damaged"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Insufficient product stock"));

        mockMvc.perform(post("/api/products/1/adjustments")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "actualQuantity": 6,
                                  "operationDate": "2026-07-21",
                                  "reason": "Data Entry Correction"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(6));

        mockMvc.perform(post("/api/products/1/adjustments")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "actualQuantity": 1,
                                  "operationDate": "2026-07-21",
                                  "reason": "Physical Inventory Count"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(1));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM raw_material_stock_movement WHERE movement_type = 'WRITE_OFF'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT total_cost FROM raw_material_stock_movement WHERE movement_type = 'WRITE_OFF'",
                BigDecimal.class)).isEqualByComparingTo("50");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT notes FROM raw_material_stock_movement WHERE movement_type = 'WRITE_OFF'",
                String.class)).isEqualTo("Reason: Damaged. Water damage");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM raw_material_stock_movement WHERE movement_type LIKE 'ADJUSTMENT_%'",
                Integer.class)).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement WHERE movement_type = 'WRITE_OFF'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement WHERE movement_type LIKE 'ADJUSTMENT_%'",
                Integer.class)).isEqualTo(2);
    }

    // @trace FR-68
    @Test
    void readsAndConsumesFloatingPointDriftedStockAsExactDecimals() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        // Earlier versions subtracted stock in SQL, leaving values such as 1 - 0.8 in existing databases.
        jdbcTemplate.update("""
                INSERT INTO raw_material
                    (name, description, unit, quantity, average_unit_cost)
                VALUES ('Ribbon', '', 'METER', 1 - 0.8, 10)
                """);

        mockMvc.perform(get("/api/raw-materials").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].quantity").value(0.2))
                .andExpect(jsonPath("$[0].stockValue").value(2.0));

        mockMvc.perform(post("/api/raw-materials/1/write-offs")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "quantity": 0.2,
                                  "operationDate": "2026-07-21",
                                  "reason": "Damaged"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(0));

        assertMaterialQuantity("Ribbon", "0");
    }

    // @trace FR-52, FR-53, FR-77
    @Test
    void rejectsDuplicateSkusAndDeletingRecordsThatAreInUse() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        createRawMaterial(session, csrfCookie, "Rose", "PIECE", "10", "20");
        createRawMaterial(session, csrfCookie, "Ribbon", "METER", "5", "10");
        createRawMaterial(session, csrfCookie, "Moss", "GRAM", "100", "1");
        saveProduct(HttpMethod.POST, "/api/products", session, csrfCookie, "ROSE-BOX-001", "Rose Box", 1)
                .andExpect(status().isCreated());
        saveProduct(HttpMethod.POST, "/api/products", session, csrfCookie, "MOSS-BOX-001", "Moss Box", 3)
                .andExpect(status().isCreated());

        saveProduct(HttpMethod.POST, "/api/products", session, csrfCookie, "rose-box-001", "Copy", 1)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("A product with SKU “rose-box-001” already exists."));
        saveProduct(HttpMethod.PUT, "/api/products/2", session, csrfCookie, "ROSE-BOX-001", "Moss Box", 3)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("A product with SKU “ROSE-BOX-001” already exists."));
        saveProduct(HttpMethod.PUT, "/api/products/2", session, csrfCookie, "MOSS-BOX-001", "Moss Box", 3)
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/raw-materials/1")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "Raw material “Rose” is used in the recipe of Rose Box. "
                                + "Remove it from the recipe before deleting it."));
        mockMvc.perform(delete("/api/raw-materials/2")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/products/2/production")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"quantity": 1, "productionDate": "2026-07-21"}
                                """))
                .andExpect(status().isOk());
        saveProduct(HttpMethod.PUT, "/api/products/2", session, csrfCookie, "MOSS-BOX-001", "Moss Box", 1)
                .andExpect(status().isOk());
        mockMvc.perform(delete("/api/raw-materials/3")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "Raw material “Moss” cannot be deleted because production batches have consumed it."));

        mockMvc.perform(post("/api/sales")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "saleDate": "2026-07-21",
                                  "paymentMethod": "CASH",
                                  "items": [{"productId": 1, "quantity": 1, "unitPrice": 30}]
                                }
                                """))
                .andExpect(status().isCreated());
        mockMvc.perform(delete("/api/products/1")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "Product “Rose Box” cannot be deleted because it has been sold."));
        mockMvc.perform(delete("/api/products/2")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isNoContent());

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO product (sku, name) VALUES ('ROSE-BOX-001', 'Copy')"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // @trace FR-50, FR-51
    @Test
    void keepsTheUnitOfRawMaterialsWhoseQuantitiesAreAlreadyRecorded() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        createRawMaterial(session, csrfCookie, "Rose", "PIECE", "10", "20");
        createRawMaterial(session, csrfCookie, "Moss", "GRAM", "0", "0");
        mockMvc.perform(get("/api/raw-materials").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'Rose')].unitChangeable").value(false))
                .andExpect(jsonPath("$[?(@.name == 'Moss')].unitChangeable").value(true));

        updateRawMaterial(session, csrfCookie, 1, "Rose", "KILOGRAM")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "The unit of “Rose” cannot be changed because stock, stock history, or recipes "
                                + "already use it. Create a new raw material for the new unit instead."));
        updateRawMaterial(session, csrfCookie, 1, "Red Rose", "PIECE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Red Rose"))
                .andExpect(jsonPath("$.unit").value("PIECE"));

        updateRawMaterial(session, csrfCookie, 2, "Moss", "KILOGRAM")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unit").value("KILOGRAM"));
        saveProduct(HttpMethod.POST, "/api/products", session, csrfCookie, "MOSS-BOX-001", "Moss Box", 2)
                .andExpect(status().isCreated());
        updateRawMaterial(session, csrfCookie, 2, "Moss", "GRAM")
                .andExpect(status().isConflict());
        assertThat(jdbcTemplate.queryForObject("SELECT unit FROM raw_material WHERE id = 2", String.class))
                .isEqualTo("KILOGRAM");
    }

    // @trace FR-78
    @Test
    void rejectsProductMarkupOrAdvertisingCostWithMoreThanTwoDecimals() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        var recipe = new MockMultipartFile(
                "recipe",
                "recipe.json",
                MediaType.APPLICATION_JSON_VALUE,
                "[{\"rawMaterialId\":1,\"quantityPerUnit\":1}]".getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/products")
                        .file(recipe)
                        .param("sku", "ROSE-BOX-001")
                        .param("name", "Rose Box")
                        .param("quantity", "0")
                        .param("advertisingCostPerUnit", "0")
                        .param("markupPercentage", "12.345")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isBadRequest());

        mockMvc.perform(multipart("/api/products")
                        .file(recipe)
                        .param("sku", "ROSE-BOX-001")
                        .param("name", "Rose Box")
                        .param("quantity", "0")
                        .param("advertisingCostPerUnit", "1.239")
                        .param("markupPercentage", "50")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isBadRequest());

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product", Integer.class)).isZero();
    }

    // @trace FR-81, FR-84, FR-89, FR-90, FR-91, FR-92, NFR-12
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
                        .param("advertisingCostPerUnit", "12")
                        .param("markupPercentage", "50")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.averageUnitCost").value(100))
                .andExpect(jsonPath("$.stockValue").value(200))
                .andExpect(jsonPath("$.advertisingCostPerUnit").value(12))
                .andExpect(jsonPath("$.markupPercentage").value(50))
                .andExpect(jsonPath("$.sellingPrice").value(225))
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
                .andExpect(jsonPath("$.averageUnitCost").value(116.6667))
                .andExpect(jsonPath("$.stockValue").value(350.0));

        assertMaterialQuantity("Rose", "7");
        assertMaterialQuantity("Ribbon", "0.2");
        assertMaterialQuantity("Gift Box", "4");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM production_batch", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM production_consumption", Integer.class)).isEqualTo(3);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT advertising_cost FROM production_batch", BigDecimal.class))
                .isEqualByComparingTo("12");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT total_cost FROM production_batch", BigDecimal.class))
                .isEqualByComparingTo("150");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_stock_movement", Integer.class)).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM raw_material_stock_movement
                WHERE movement_type = 'PRODUCTION_CONSUMPTION'
                """,
                Integer.class)).isEqualTo(3);
    }

    // @trace FR-128, FR-130, FR-133
    @Test
    void listsAndFiltersUnifiedStockMovementHistory() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO raw_material
                    (id, name, description, unit, quantity, average_unit_cost)
                VALUES (1, 'Rose', '', 'PIECE', 8, 5)
                """);
        jdbcTemplate.update("""
                INSERT INTO product
                    (id, sku, name, description, quantity, price,
                     markup_percentage, advertising_cost_per_unit, average_unit_cost)
                VALUES (1, 'ROSE-BOX-001', 'Rose Box', '', 2, 40, 50, 2, 20)
                """);
        jdbcTemplate.update("""
                INSERT INTO raw_material_stock_movement
                    (raw_material_id, movement_type, quantity, unit_cost,
                     total_cost, occurred_at, notes)
                VALUES
                    (1, 'RECEIPT', 10, 5, 50, '2026-07-01', 'Supplier delivery'),
                    (1, 'WRITE_OFF', 2, 5, 10, '2026-07-02', 'Reason: Damaged')
                """);
        jdbcTemplate.update("""
                INSERT INTO product_stock_movement
                    (product_id, movement_type, quantity, unit_cost,
                     total_cost, occurred_at, notes)
                VALUES
                    (1, 'PRODUCTION', 3, 20, 60, '2026-07-03', 'Production batch'),
                    (1, 'SALE', 1, 20, 20, '2026-07-04', 'Sale document')
                """);

        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);

        mockMvc.perform(get("/api/stock-movements")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-31")
                        .param("size", "2")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.movements.length()").value(2))
                .andExpect(jsonPath("$.movements[0].movementType").value("SALE"))
                .andExpect(jsonPath("$.movements[0].signedQuantity").value(-1))
                .andExpect(jsonPath("$.totals.incomingValue").value(110))
                .andExpect(jsonPath("$.totals.outgoingValue").value(30))
                .andExpect(jsonPath("$.totals.netValueChange").value(80));

        mockMvc.perform(get("/api/stock-movements")
                        .param("inventoryType", "RAW_MATERIAL")
                        .param("movementType", "RECEIPT")
                        .param("query", "rose")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.movements[0].inventoryType").value("RAW_MATERIAL"))
                .andExpect(jsonPath("$.movements[0].movementType").value("RECEIPT"))
                .andExpect(jsonPath("$.movements[0].signedTotalCost").value(50));

        mockMvc.perform(get("/api/stock-movements")
                        .param("from", "2026-07-31")
                        .param("to", "2026-07-01")
                        .session(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("From date cannot be later than To date"));
    }

    // @trace FR-129, FR-133
    @Test
    void searchesStockHistoryByNameOrSkuIgnoringCaseInAnyAlphabet() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO raw_material
                    (id, name, description, unit, quantity, average_unit_cost)
                VALUES (1, 'Троянда', '', 'PIECE', 10, 5)
                """);
        jdbcTemplate.update("""
                INSERT INTO product
                    (id, sku, name, description, quantity, price, average_unit_cost)
                VALUES (1, 'ROSE-BOX-001', 'Букет Троянд', '', 3, 40, 20)
                """);
        jdbcTemplate.update("""
                INSERT INTO raw_material_stock_movement
                    (raw_material_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                VALUES (1, 'RECEIPT', 10, 5, 50, '2026-07-01')
                """);
        jdbcTemplate.update("""
                INSERT INTO product_stock_movement
                    (product_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                VALUES (1, 'PRODUCTION', 3, 20, 60, '2026-07-02')
                """);

        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);

        mockMvc.perform(get("/api/stock-movements").param("query", "троянда").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.movements[0].itemName").value("Троянда"));
        mockMvc.perform(get("/api/stock-movements").param("query", "ТРОЯНД").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
        mockMvc.perform(get("/api/stock-movements").param("query", "rose-box").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.movements[0].itemCode").value("ROSE-BOX-001"));
        mockMvc.perform(get("/api/stock-movements").param("query", "tulip").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.totals.netValueChange").value(0));
    }

    // @trace FR-1, FR-45, FR-47, FR-62, FR-63
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

    // @trace FR-51, FR-57, FR-58
    @Test
    void recordsRawMaterialReorderLevelAndLowStockFlag() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        // Quantity 3 at a reorder level of 5 is below the level.
        createRawMaterialWithReorderLevel(session, csrfCookie, "Rose", "3", "5")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reorderLevel").value(5))
                .andExpect(jsonPath("$.belowReorderLevel").value(true));

        // A reorder level of 0 means "not tracked", so a low quantity is still not flagged.
        createRawMaterialWithReorderLevel(session, csrfCookie, "Ribbon", "2", "0")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reorderLevel").value(0))
                .andExpect(jsonPath("$.belowReorderLevel").value(false));

        // Editing the level down to 2 (below the quantity 3) clears the flag and persists the new level.
        mockMvc.perform(multipart(HttpMethod.PUT, "/api/raw-materials/1")
                        .param("name", "Rose")
                        .param("unit", "PIECE")
                        .param("reorderLevel", "2")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reorderLevel").value(2))
                .andExpect(jsonPath("$.belowReorderLevel").value(false));
    }

    // @trace FR-39, FR-58
    @Test
    void dashboardCountsLowStockRawMaterials() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        createRawMaterialWithReorderLevel(session, csrfCookie, "Below", "3", "5")
                .andExpect(status().isCreated()); // 3 <= 5 -> low
        createRawMaterialWithReorderLevel(session, csrfCookie, "Boundary", "5", "5")
                .andExpect(status().isCreated()); // 5 <= 5 -> low (boundary counts)
        createRawMaterialWithReorderLevel(session, csrfCookie, "Untracked", "1", "0")
                .andExpect(status().isCreated()); // reorder 0 -> not tracked
        createRawMaterialWithReorderLevel(session, csrfCookie, "Above", "10", "5")
                .andExpect(status().isCreated()); // 10 > 5 -> not low

        mockMvc.perform(get("/api/dashboard").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lowStockRawMaterials").value(2));
    }

    // @trace FR-7, FR-23
    @Test
    void reportsTheActualSessionTimeoutWithoutCreatingAnonymousSessions() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("X-Session-Timeout-Seconds"));
        var result = login(testPassword)
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Session-Timeout-Seconds"))
                .andReturn();
        var session = (MockHttpSession) result.getRequest().getSession(false);
        session.setMaxInactiveInterval(90);
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Session-Timeout-Seconds", "90"));
        mockMvc.perform(get("/api/dashboard").session(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Session-Timeout-Seconds", "90"));
        session.invalidate();
        mockMvc.perform(get("/api/dashboard").session(session))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("X-Session-Timeout-Seconds"));
    }

    // @trace FR-10, FR-11, FR-14
    @Test
    void changesTheAuthenticatedAdminPasswordAndEndsAllSessions() throws Exception {
        var login = login(testPassword)
                .andExpect(status().isOk())
                .andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var otherBrowser = (MockHttpSession) login(testPassword)
                .andExpect(status().isOk())
                .andReturn()
                .getRequest()
                .getSession(false);
        mockMvc.perform(get("/api/auth/me").session(otherBrowser))
                .andExpect(status().isOk());
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
        mockMvc.perform(get("/api/auth/me").session(otherBrowser))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Your session has ended. Please sign in again."));
        assertThat(otherBrowser.isInvalid()).isTrue();
        login(testPassword).andExpect(status().isUnauthorized());
        login(newPassword).andExpect(status().isOk());
    }

    // @trace FR-2
    @Test
    void matchesUsernamesRegardlessOfCase() throws Exception {
        login("ADMIN", testPassword).andExpect(status().isOk());

        assertThatThrownBy(() -> userRepository.insertAdmin("Admin", passwordEncoder.encode("x")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // @trace FR-3
    @Test
    void answersEveryFailedSignInWithTheSameMessage() throws Exception {
        login("wrong-" + testPassword)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid username or password"));
        login("nobody", testPassword)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid username or password"));

        jdbcTemplate.update("UPDATE app_user SET enabled = 0 WHERE username = 'admin'");
        login(testPassword)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid username or password"));
    }

    // @trace FR-4
    @Test
    void answersWithJsonMessagesWhenAuthenticationOrTheAdminRoleIsMissing() throws Exception {
        mockMvc.perform(get("/api/dashboard"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication required"));

        var clerk = new SecurityContextImpl(UsernamePasswordAuthenticationToken.authenticated(
                "clerk", null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        var clerkSession = new MockHttpSession();
        clerkSession.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, clerk);
        mockMvc.perform(get("/api/dashboard").session(clerkSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Access denied"));

        mockMvc.perform(get("/api/health")).andExpect(status().isOk());
        mockMvc.perform(get("/api/auth/csrf")).andExpect(status().isOk());
    }

    // @trace FR-6, NFR-5
    // @trace FR-5
    @Test
    void rejectsStateChangingRequestsWithoutAMatchingCsrfToken() throws Exception {
        var csrfCookie = mockMvc.perform(get("/api/auth/csrf"))
                .andReturn()
                .getResponse()
                .getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();
        var credentials = """
                {"username":"admin","password":"%s"}
                """.formatted(testPassword);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Access denied"));
        mockMvc.perform(post("/api/auth/login")
                        .cookie(csrfCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/auth/login")
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", "not-the-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials))
                .andExpect(status().isForbidden());

        var session = signedInSession();
        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isForbidden());
        assertThat(session.isInvalid()).isFalse();
        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
    }

    // @trace FR-8
    @Test
    void logsOutWithNoContentAndEndsTheServerSession() throws Exception {
        var session = signedInSession();
        var csrfCookie = csrfCookie(session);

        mockMvc.perform(post("/api/auth/logout")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isNoContent());

        assertThat(session.isInvalid()).isTrue();
        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    }

    // @trace FR-12
    @Test
    void rejectsANewPasswordWhoseConfirmationDiffers() throws Exception {
        var session = signedInSession();

        changePassword(session, testPassword, "Changed-" + UUID.randomUUID(), "Other-" + UUID.randomUUID())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("New password confirmation does not match"));
    }

    // @trace FR-13, NFR-1
    @Test
    void rejectsANewPasswordEqualToTheCurrentOne() throws Exception {
        var session = signedInSession();

        changePassword(session, testPassword, testPassword, testPassword)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("New password must be different from current password"));
        login(testPassword).andExpect(status().isOk());
    }

    // @trace NFR-6
    @Test
    void sendsTheContentSecurityPolicyOnEveryResponse() throws Exception {
        var policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                + "script-src 'self'; connect-src 'self'";

        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", policy));
        mockMvc.perform(get("/api/dashboard"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Content-Security-Policy", policy));
    }

    // @trace NFR-7
    @Test
    void issuesANewSessionIdentifierAtSignIn() throws Exception {
        var beforeSignIn = new MockHttpSession();
        var identifierBefore = beforeSignIn.getId();

        var result = login("admin", testPassword, beforeSignIn)
                .andExpect(status().isOk())
                .andReturn();

        assertThat(result.getRequest().getSession(false).getId()).isNotEqualTo(identifierBefore);
    }

    // @trace NFR-9
    @Test
    void doesNotLeakStackTracesOrFrameworkMessagesInErrors() throws Exception {
        assertThat(errorIncludeMessage).isEqualTo("never");
        assertThat(errorIncludeStacktrace).isEqualTo("never");

        var csrfCookie = mockMvc.perform(get("/api/auth/csrf"))
                .andReturn()
                .getResponse()
                .getCookie("XSRF-TOKEN");
        var malformed = mockMvc.perform(post("/api/auth/login")
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(malformed).doesNotContain("Exception", "at com.", "at org.", "stackTrace");

        var errorPage = mockMvc.perform(get("/error")).andReturn().getResponse().getContentAsString();
        assertThat(errorPage).doesNotContain("Exception", "at com.", "at org.", "trace");
    }

    // @trace NFR-10
    @Test
    void doesNotLockTheAccountAfterRepeatedFailedSignIns() throws Exception {
        for (var attempt = 0; attempt < 6; attempt++) {
            login("wrong-" + attempt).andExpect(status().isUnauthorized());
        }

        login(testPassword).andExpect(status().isOk());
    }

    // @trace NFR-11
    @Test
    void allowsOnlyTheAdminRoleAndKeepsEveryConcurrentSessionValid() throws Exception {
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO app_user (username, password_hash, role) VALUES ('clerk', 'x', 'MANAGER')"))
                .isInstanceOf(DataIntegrityViolationException.class);

        var sessions = List.of(signedInSession(), signedInSession(), signedInSession());

        for (var session : sessions) {
            mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
        }
    }

    // @trace NFR-3
    @Test
    void keepsSessionsForEightHoursOfInactivity() {
        assertThat(sessionTimeout).isEqualTo("8h");
    }

    // @trace FR-37
    @Test
    void countsRawMaterialsProductsAndProductUnitsOnTheDashboard() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO raw_material (id, name, description, unit, quantity, average_unit_cost)
                VALUES (1, 'Rose', '', 'PIECE', 8, 5), (2, 'Ribbon', '', 'METER', 3, 1)
                """);
        insertProduct(1, "BOX-1", "Box one", 4, "40", "20");
        insertProduct(2, "BOX-2", "Box two", 3, "50", "25");
        insertProduct(3, "BOX-3", "Box three", 0, "60", "30");

        mockMvc.perform(get("/api/dashboard").session(signedInSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rawMaterialTypes").value(2))
                .andExpect(jsonPath("$.productTypes").value(3))
                .andExpect(jsonPath("$.productUnits").value(7));
    }

    // @trace FR-38
    @Test
    void countsOnlyCompletedSalesOnTheDashboard() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        var session = signedInSession();
        createSale(session, "2026-07-01", 1, 1, "40");
        var cancelled = createSale(session, "2026-07-02", 1, 1, "40");
        var partlyReturned = createSale(session, "2026-07-03", 1, 2, "40");
        var returned = createSale(session, "2026-07-04", 1, 1, "40");
        cancelSale(session, cancelled, "2026-07-05").andExpect(status().isOk());
        postReturn(session, partlyReturned, "2026-07-05", "Damaged", returnItem(firstItemId(partlyReturned), "1"))
                .andExpect(status().isOk());
        postReturn(session, returned, "2026-07-05", "Damaged", returnItem(firstItemId(returned), "1"))
                .andExpect(status().isOk());

        assertThat(jdbcTemplate.queryForList("SELECT status FROM sale ORDER BY id", String.class))
                .containsExactly("COMPLETED", "CANCELLED", "PARTIALLY_RETURNED", "RETURNED");
        mockMvc.perform(get("/api/dashboard").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salesCount").value(1));
    }

    // @trace FR-102
    @Test
    void rejectsInvalidSaleItemsAndRecordsNothing() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 5, "40", "20");
        var session = signedInSession();

        postSale(session, "2026-07-21", saleItem(999, "1", "40"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Record not found"))
                .andExpect(jsonPath("$.detail").value("Product with id 999 not found"));
        postSale(session, "2026-07-21", saleItem(1, "1", "40") + "," + saleItem(1, "2", "40"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Each product can appear only once in a sale"));
        for (var invalid : List.of(
                saleItem(1, "1.5", "40"),
                saleItem(1, "1234567890123", "40"),
                saleItem(1, "0", "40"),
                saleItem(1, "1", "-1"),
                saleItem(1, "1", "1.005"))) {
            postSale(session, "2026-07-21", invalid)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.title").value("Bad Request"));
        }

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sale", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("5");
    }

    // @trace FR-103
    @Test
    void numbersSalesWithinTheirOwnDate() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        var session = signedInSession();

        postSale(session, "2026-07-21", saleItem(1, "1", "40"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.saleNumber").value("SALE-20260721-0001"));
        postSale(session, "2026-07-21", saleItem(1, "1", "40"))
                .andExpect(jsonPath("$.saleNumber").value("SALE-20260721-0002"));
        postSale(session, "2026-07-22", saleItem(1, "1", "40"))
                .andExpect(jsonPath("$.saleNumber").value("SALE-20260722-0001"));
    }

    // @trace FR-107
    @Test
    void recordsANegativeGrossProfitWhenAProductIsSoldBelowItsCost() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 5, "250", "150");
        var session = signedInSession();

        postSale(session, "2026-07-21", saleItem(1, "2", "100"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.totalRevenue").value(200))
                .andExpect(jsonPath("$.totalCost").value(300))
                .andExpect(jsonPath("$.grossProfit").value(-100))
                .andExpect(jsonPath("$.items[0].lineProfit").value(-100));
    }

    // @trace FR-109
    @Test
    void listsSalesNewestFirstAndAnswers404ForAnUnknownSale() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        var session = signedInSession();
        var first = createSale(session, "2026-07-20", 1, 1, "40");
        var second = createSale(session, "2026-07-22", 1, 1, "40");
        var third = createSale(session, "2026-07-22", 1, 1, "40");

        mockMvc.perform(get("/api/sales").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].id").value(third))
                .andExpect(jsonPath("$[1].id").value(second))
                .andExpect(jsonPath("$[2].id").value(first));
        mockMvc.perform(get("/api/sales/999").session(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Record not found"))
                .andExpect(jsonPath("$.detail").value("Sale with id 999 not found"));
    }

    // @trace FR-110
    @Test
    void offersNoWayToEditOrDeleteASale() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 5, "40", "20");
        var session = signedInSession();
        var sale = createSale(session, "2026-07-21", 1, 1, "40");

        for (var method : List.of(HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE)) {
            var csrfCookie = csrfCookie(session);
            mockMvc.perform(request(method, "/api/sales/" + sale)
                            .session(session)
                            .cookie(csrfCookie)
                            .header("X-XSRF-TOKEN", csrfCookie.getValue())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isMethodNotAllowed());
        }

        mockMvc.perform(get("/api/sales/" + sale).session(session)).andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sale", Integer.class)).isEqualTo(1);
    }

    // @trace FR-114
    @Test
    void rejectsReturnsWithDuplicateForeignOrBlankInput() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        insertProduct(2, "BOX-2", "Box two", 10, "50", "25");
        var session = signedInSession();
        var saleA = createSale(session, "2026-07-01", 1, 2, "40");
        var saleB = createSale(session, "2026-07-01", 2, 2, "50");
        var itemA = firstItemId(saleA);
        var itemB = firstItemId(saleB);

        postReturn(session, saleA, "2026-07-02", "Damaged", returnItem(itemA, "1") + "," + returnItem(itemA, "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Each sale item can appear only once in a return"));
        postReturn(session, saleA, "2026-07-02", "Damaged", returnItem(itemB, "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail")
                        .value("Sale item with id %d does not belong to this sale".formatted(itemB)));
        postReturn(session, saleA, "2026-07-02", " ", returnItem(itemA, "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Bad Request"));

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sale_return", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("8");
    }

    // @trace FR-116
    @Test
    void acceptsNoReturnOnACancelledOrFullyReturnedSale() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        var session = signedInSession();
        var cancelled = createSale(session, "2026-07-01", 1, 1, "40");
        cancelSale(session, cancelled, "2026-07-02").andExpect(status().isOk());
        var returned = createSale(session, "2026-07-01", 1, 1, "40");
        postReturn(session, returned, "2026-07-02", "Damaged", returnItem(firstItemId(returned), "1"))
                .andExpect(status().isOk());

        postReturn(session, cancelled, "2026-07-03", "Late", returnItem(firstItemId(cancelled), "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("A cancelled sale cannot receive Product returns"));
        postReturn(session, returned, "2026-07-03", "Late", returnItem(firstItemId(returned), "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("All Products from this sale have already been returned"));
    }

    // @trace FR-117
    @Test
    void rejectsAReturnOrCancellationDatedBeforeTheSale() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        var session = signedInSession();
        var sale = createSale(session, "2026-07-10", 1, 2, "40");
        var item = firstItemId(sale);

        postReturn(session, sale, "2026-07-09", "Damaged", returnItem(item, "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Return date cannot be earlier than the sale date"));
        cancelSale(session, sale, "2026-07-09")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Cancellation date cannot be earlier than the sale date"));

        postReturn(session, sale, "2026-07-10", "Damaged", returnItem(item, "1")).andExpect(status().isOk());
    }

    // @trace FR-118
    @Test
    void numbersReversalsWithinTheirOwnDate() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        var session = signedInSession();
        var sale = createSale(session, "2026-07-01", 1, 3, "40");
        var item = firstItemId(sale);

        postReturn(session, sale, "2026-08-02", "Damaged", returnItem(item, "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.returns[0].returnNumber").value("RET-20260802-0001"));
        postReturn(session, sale, "2026-08-02", "Damaged", returnItem(item, "1"))
                .andExpect(jsonPath("$.returns[1].returnNumber").value("RET-20260802-0002"));
        postReturn(session, sale, "2026-08-03", "Damaged", returnItem(item, "1"))
                .andExpect(jsonPath("$.returns[2].returnNumber").value("RET-20260803-0001"));
    }

    // @trace FR-127
    @Test
    void marksEveryMovementTypeAsIncomingOrOutgoingWithMatchingSigns() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO raw_material (id, name, description, unit, quantity, average_unit_cost)
                VALUES (1, 'Rose', '', 'PIECE', 8, 5)
                """);
        insertProduct(1, "BOX-1", "Box one", 5, "40", "20");
        var rawTypes = List.of("OPENING_BALANCE", "RECEIPT", "PRODUCTION_CONSUMPTION", "WRITE_OFF",
                "ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE");
        var productTypes = List.of("OPENING_BALANCE", "PRODUCTION", "SALE", "WRITE_OFF", "ADJUSTMENT_INCREASE",
                "ADJUSTMENT_DECREASE", "SALE_RETURN", "SALE_CANCELLATION");
        for (var type : rawTypes) {
            jdbcTemplate.update("""
                    INSERT INTO raw_material_stock_movement
                        (raw_material_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                    VALUES (1, '%s', 2, 5, 10, '2026-07-01')
                    """.formatted(type));
        }
        for (var type : productTypes) {
            jdbcTemplate.update("""
                    INSERT INTO product_stock_movement
                        (product_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                    VALUES (1, '%s', 2, 5, 10, '2026-07-01')
                    """.formatted(type));
        }
        var incoming = List.of(
                "RAW_MATERIAL/OPENING_BALANCE", "RAW_MATERIAL/RECEIPT", "RAW_MATERIAL/ADJUSTMENT_INCREASE",
                "PRODUCT/OPENING_BALANCE", "PRODUCT/PRODUCTION", "PRODUCT/ADJUSTMENT_INCREASE",
                "PRODUCT/SALE_RETURN", "PRODUCT/SALE_CANCELLATION");

        var result = mockMvc.perform(get("/api/stock-movements").param("size", "100").session(signedInSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(rawTypes.size() + productTypes.size()));
        var all = new ArrayList<String>();
        rawTypes.forEach(type -> all.add("RAW_MATERIAL/" + type));
        productTypes.forEach(type -> all.add("PRODUCT/" + type));
        for (var key : all) {
            var parts = key.split("/");
            var in = incoming.contains(key);
            var filter = "$.movements[?(@.inventoryType=='%s' && @.movementType=='%s')]"
                    .formatted(parts[0], parts[1]);
            result.andExpect(jsonPath(filter + ".direction").value(in ? "IN" : "OUT"));
            result.andExpect(jsonPath(filter + ".signedQuantity").value(in ? 2 : -2));
            result.andExpect(jsonPath(filter + ".signedTotalCost").value(in ? 10.0 : -10.0));
        }
    }

    // @trace FR-131
    @Test
    void pagesStockHistoryWithADefaultOf25AndBoundedSizes() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO raw_material (id, name, description, unit, quantity, average_unit_cost)
                VALUES (1, 'Rose', '', 'PIECE', 8, 5)
                """);
        for (var day = 1; day <= 30; day++) {
            jdbcTemplate.update("""
                    INSERT INTO raw_material_stock_movement
                        (raw_material_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                    VALUES (1, 'RECEIPT', 1, 5, 5, '2026-07-%02d')
                    """.formatted(day));
        }
        var session = signedInSession();

        mockMvc.perform(get("/api/stock-movements").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(25))
                .andExpect(jsonPath("$.totalElements").value(30))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.movements.length()").value(25));
        mockMvc.perform(get("/api/stock-movements").param("page", "1").session(session))
                .andExpect(jsonPath("$.movements.length()").value(5));
        mockMvc.perform(get("/api/stock-movements").param("size", "100").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movements.length()").value(30));
        for (var invalid : List.of(
                new String[] {"size", "0"}, new String[] {"size", "101"}, new String[] {"page", "-1"})) {
            mockMvc.perform(get("/api/stock-movements").param(invalid[0], invalid[1]).session(session))
                    .andExpect(status().isBadRequest());
        }
    }

    // @trace FR-132
    @Test
    void ordersStockHistoryByDateThenCreationTimeThenInventoryTypeThenNewestId() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO raw_material (id, name, description, unit, quantity, average_unit_cost)
                VALUES (1, 'Rose', '', 'PIECE', 8, 5)
                """);
        insertProduct(1, "BOX-1", "Box one", 5, "40", "20");
        jdbcTemplate.update("""
                INSERT INTO raw_material_stock_movement
                    (raw_material_id, movement_type, quantity, unit_cost, total_cost, occurred_at, notes, created_at)
                VALUES
                    (1, 'RECEIPT', 1, 5, 5, '2026-07-05', 'raw first', '2026-07-05 10:00:00'),
                    (1, 'RECEIPT', 1, 5, 5, '2026-07-05', 'raw second', '2026-07-05 10:00:00'),
                    (1, 'RECEIPT', 1, 5, 5, '2026-07-04', 'older day', '2026-07-04 12:00:00')
                """);
        jdbcTemplate.update("""
                INSERT INTO product_stock_movement
                    (product_id, movement_type, quantity, unit_cost, total_cost, occurred_at, notes, created_at)
                VALUES
                    (1, 'PRODUCTION', 1, 20, 20, '2026-07-05', 'product first', '2026-07-05 10:00:00'),
                    (1, 'PRODUCTION', 1, 20, 20, '2026-07-05', 'product later', '2026-07-05 11:00:00')
                """);

        mockMvc.perform(get("/api/stock-movements").session(signedInSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movements[0].notes").value("product later"))
                .andExpect(jsonPath("$.movements[1].notes").value("product first"))
                .andExpect(jsonPath("$.movements[2].notes").value("raw second"))
                .andExpect(jsonPath("$.movements[3].notes").value("raw first"))
                .andExpect(jsonPath("$.movements[4].notes").value("older day"));
    }

    // @trace FR-134
    @Test
    void referencesTheSaleTheReturnAndTheProductionBatchOnProductMovements() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 10, "40", "20");
        jdbcTemplate.update("""
                INSERT INTO production_batch (id, product_id, quantity, unit_cost, total_cost, produced_at)
                VALUES (1, 1, 3, 20, 60, '2026-06-30')
                """);
        jdbcTemplate.update("""
                INSERT INTO product_stock_movement
                    (product_id, production_batch_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                VALUES (1, 1, 'PRODUCTION', 3, 20, 60, '2026-06-30')
                """);
        var session = signedInSession();
        var returnedSale = createSale(session, "2026-07-01", 1, 2, "40");
        postReturn(session, returnedSale, "2026-07-02", "Damaged", returnItem(firstItemId(returnedSale), "1"))
                .andExpect(status().isOk());
        var cancelledSale = createSale(session, "2026-07-02", 1, 1, "40");
        cancelSale(session, cancelledSale, "2026-07-03").andExpect(status().isOk());

        var result = mockMvc.perform(get("/api/stock-movements")
                        .param("inventoryType", "PRODUCT")
                        .param("size", "100")
                        .session(session))
                .andExpect(status().isOk());
        var sale = "$.movements[?(@.movementType=='SALE' && @.referenceNumber=='SALE-20260701-0001')]";
        result.andExpect(jsonPath(sale + ".referenceType").value("SALE"));
        result.andExpect(jsonPath(sale + ".referenceId").value((int) returnedSale));
        var saleReturn = "$.movements[?(@.movementType=='SALE_RETURN')]";
        result.andExpect(jsonPath(saleReturn + ".referenceType").value("SALE_RETURN"));
        result.andExpect(jsonPath(saleReturn + ".referenceNumber").value("RET-20260702-0001"));
        result.andExpect(jsonPath(saleReturn + ".referenceId").value((int) returnedSale));
        var cancellation = "$.movements[?(@.movementType=='SALE_CANCELLATION')]";
        result.andExpect(jsonPath(cancellation + ".referenceType").value("SALE_RETURN"));
        result.andExpect(jsonPath(cancellation + ".referenceNumber").value("RET-20260703-0001"));
        result.andExpect(jsonPath(cancellation + ".referenceId").value((int) cancelledSale));
        var production = "$.movements[?(@.movementType=='PRODUCTION')]";
        result.andExpect(jsonPath(production + ".referenceType").value("PRODUCTION_BATCH"));
        result.andExpect(jsonPath(production + ".referenceNumber").value("Batch #1"));
        result.andExpect(jsonPath(production + ".referenceId").value(1));
    }

    // @trace FR-141
    @Test
    void reportsAnAverageSaleValueOfZeroWhenAMonthHasNoSales() throws Exception {
        mockMvc.perform(get("/api/reports/monthly-sales").param("month", "2026-07").session(signedInSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salesCount").value(0))
                .andExpect(jsonPath("$.grossRevenue").value(0))
                .andExpect(jsonPath("$.averageSaleValue").value(0.0));
    }

    // @trace FR-143
    @Test
    void ordersDailyAndProductSummariesByDateAndByNetRevenueThenName() throws Exception {
        insertProduct(1, "ALPHA", "Alpha", 5, "100", "10");
        insertProduct(2, "BRAVO", "Bravo", 5, "100", "10");
        insertProduct(3, "CHARLIE", "Charlie", 5, "300", "10");
        insertProduct(4, "DELTA", "Delta", 5, "100", "10");
        var session = signedInSession();
        var bravoSale = createSale(session, "2026-07-10", 2, 1, "100");
        createSale(session, "2026-07-03", 1, 1, "100");
        createSale(session, "2026-07-20", 3, 1, "300");
        createSale(session, "2026-07-12", 4, 1, "100");
        postReturn(session, bravoSale, "2026-07-15", "Changed mind", returnItem(firstItemId(bravoSale), "1"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/reports/monthly-sales").param("month", "2026-07").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dailySummaries.length()").value(5))
                .andExpect(jsonPath("$.dailySummaries[0].saleDate").value("2026-07-03"))
                .andExpect(jsonPath("$.dailySummaries[1].saleDate").value("2026-07-10"))
                .andExpect(jsonPath("$.dailySummaries[2].saleDate").value("2026-07-12"))
                .andExpect(jsonPath("$.dailySummaries[3].saleDate").value("2026-07-15"))
                .andExpect(jsonPath("$.dailySummaries[4].saleDate").value("2026-07-20"))
                .andExpect(jsonPath("$.productSummaries[0].productName").value("Charlie"))
                .andExpect(jsonPath("$.productSummaries[1].productName").value("Alpha"))
                .andExpect(jsonPath("$.productSummaries[2].productName").value("Delta"))
                .andExpect(jsonPath("$.productSummaries[3].productName").value("Bravo"));
    }

    // @trace NFR-8
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

    // @trace FR-81, NFR-14
    @Test
    void roundsSellingPricesHalfUpToCentsLikeThePricePreview() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        createRawMaterial(session, csrfCookie, "Rose", "PIECE", "10", "0.73");
        createRawMaterial(session, csrfCookie, "Tulip", "PIECE", "10", "3.65");
        createRawMaterial(session, csrfCookie, "Moss", "GRAM", "10", "0.61");
        createRawMaterial(session, csrfCookie, "Fern", "PIECE", "10", "0.5");

        // Exact prices 2.555, 4.015 and 2.135: the cases the products page previews in products.component.spec.ts.
        assertSellingPrice(session, csrfCookie, "ROSE-PAIR", 1, "2", "75", 2.56);
        assertSellingPrice(session, csrfCookie, "TULIP-ONE", 2, "1", "10", 4.02);
        assertSellingPrice(session, csrfCookie, "MOSS-ONE", 3, "1", "250", 2.14);
        // Exact price 0.545: half-even rounding would give 0.54.
        assertSellingPrice(session, csrfCookie, "FERN-ONE", 4, "1", "9", 0.55);
    }

    // @trace FR-120, NFR-14
    @Test
    void reversesReturnedCostWithHalfUpDivisionLikeTheReturnPreview() throws Exception {
        var login = login(testPassword).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        jdbcTemplate.update("""
                INSERT INTO product
                    (sku, name, description, quantity, price, markup_percentage, average_unit_cost)
                VALUES ('ROSE-BOX-001', 'Rose Box', '', 2, 5, 0, 2.175),
                       ('MOSS-BOX-001', 'Moss Box', '', 6, 1, 0, 0.0117),
                       ('FERN-BOX-001', 'Fern Box', '', 2, 5, 0, 2.125)
                """);
        mockMvc.perform(post("/api/sales")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "saleDate": "2026-07-20",
                                  "paymentMethod": "CASH",
                                  "items": [
                                    {"productId": 1, "quantity": 2, "unitPrice": 5},
                                    {"productId": 2, "quantity": 6, "unitPrice": 1},
                                    {"productId": 3, "quantity": 2, "unitPrice": 5}
                                  ]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.items[0].lineCost").value(4.35))
                .andExpect(jsonPath("$.items[1].lineCost").value(0.07))
                .andExpect(jsonPath("$.items[2].lineCost").value(4.25));

        // Exact shares 4.35 × 1/2 = 2.175 and 0.07 × 3/6 = 0.035: the cases the sales page previews (#41).
        // 4.25 × 1/2 = 2.125: half-even rounding would give 2.12.
        mockMvc.perform(post("/api/sales/1/returns")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "returnDate": "2026-07-21",
                                  "reason": "Customer Return",
                                  "items": [
                                    {"saleItemId": 1, "quantity": 1},
                                    {"saleItemId": 2, "quantity": 3},
                                    {"saleItemId": 3, "quantity": 1}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].returnedCost").value(2.18))
                .andExpect(jsonPath("$.items[1].returnedCost").value(0.04))
                .andExpect(jsonPath("$.items[2].returnedCost").value(2.13));

        assertThat(jdbcTemplate.queryForList(
                "SELECT line_cost FROM sale_return_item ORDER BY sale_item_id", BigDecimal.class))
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("2.18"), new BigDecimal("0.04"), new BigDecimal("2.13"));
    }

    // @trace FR-42
    @Test
    void rejectsRawMaterialsWithATooLongNameOrDescriptionOrANegativeQuantity() throws Exception {
        var session = signedInSession();

        postRawMaterial(session, "N".repeat(121), "", "PIECE", "1", "1").andExpect(status().isBadRequest());
        postRawMaterial(session, "   ", "", "PIECE", "1", "1").andExpect(status().isBadRequest());
        postRawMaterial(session, "Rose", "d".repeat(1001), "PIECE", "1", "1").andExpect(status().isBadRequest());
        postRawMaterial(session, "Rose", "", "PIECE", "-1", "1").andExpect(status().isBadRequest());
        assertThat(rowCount("raw_material")).isZero();

        // The limits themselves are accepted: 120 characters of name, 1000 of description, a quantity of 0.
        postRawMaterial(session, "N".repeat(120), "d".repeat(1000), "PIECE", "0", null)
                .andExpect(status().isCreated());
        assertThat(rowCount("raw_material")).isEqualTo(1);
    }

    // @trace FR-43
    @Test
    void rejectsAnUnsupportedMeasurementUnitOnCreateAndOnUpdate() throws Exception {
        var session = signedInSession();

        postRawMaterial(session, "Rose", "", "LITER", "1", "1")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid data"))
                .andExpect(jsonPath("$.detail").value("Unsupported measurement unit"));
        assertThat(rowCount("raw_material")).isZero();

        postRawMaterial(session, "Rose", "", "PIECE", "0", null).andExpect(status().isCreated());
        putRawMaterial(session, 1, "Rose", "LITER", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Unsupported measurement unit"));
        assertThat(jdbcTemplate.queryForObject("SELECT unit FROM raw_material WHERE id = 1", String.class))
                .isEqualTo("PIECE");
    }

    // @trace FR-46
    @Test
    void recordsNoOpeningMovementForARawMaterialCreatedWithoutStock() throws Exception {
        var session = signedInSession();

        postRawMaterial(session, "Empty", "", "PIECE", "0", null)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(0))
                .andExpect(jsonPath("$.averageUnitCost").value(0));
        assertThat(rowCount("raw_material_stock_movement")).isZero();

        // With stock, the same call records the opening movement.
        postRawMaterial(session, "Stocked", "", "PIECE", "4", "2.50").andExpect(status().isCreated());
        assertThat(jdbcTemplate.queryForList(
                "SELECT movement_type FROM raw_material_stock_movement WHERE raw_material_id = 2",
                String.class)).containsExactly("OPENING_BALANCE");
    }

    // @trace FR-48
    @Test
    void listsRawMaterialsByNameIgnoringCase() throws Exception {
        var session = signedInSession();
        for (var name : List.of("tulip", "Rose", "ribbon", "Anemone", "Baby's breath")) {
            postRawMaterial(session, name, "", "PIECE", "0", null).andExpect(status().isCreated());
        }

        mockMvc.perform(get("/api/raw-materials").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].name").value("Anemone"))
                .andExpect(jsonPath("$[1].name").value("Baby's breath"))
                .andExpect(jsonPath("$[2].name").value("ribbon"))
                .andExpect(jsonPath("$[3].name").value("Rose"))
                .andExpect(jsonPath("$[4].name").value("tulip"));
    }

    // @trace FR-49
    @Test
    void answers404WhenUpdatingAnUnknownRawMaterial() throws Exception {
        var session = signedInSession();
        postRawMaterial(session, "Rose", "", "PIECE", "0", null).andExpect(status().isCreated());

        putRawMaterial(session, 999, "Renamed", "PIECE", null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Record not found"))
                .andExpect(jsonPath("$.detail").value("Raw material with id 999 not found"));
        assertThat(jdbcTemplate.queryForList("SELECT name FROM raw_material", String.class))
                .containsExactly("Rose");
    }

    // @trace FR-54
    @Test
    void removesTheStockMovementsWithTheDeletedRawMaterial() throws Exception {
        var session = signedInSession();
        postRawMaterial(session, "Rose", "", "PIECE", "10", "2").andExpect(status().isCreated());
        postRawMaterial(session, "Ribbon", "", "METER", "5", "1").andExpect(status().isCreated());
        postJson(session, "/api/raw-materials/1/receipts", """
                {"receivedQuantity": 4, "unitPurchaseCost": 3, "receiptDate": "2026-07-19"}""")
                .andExpect(status().isOk());
        assertThat(rowCount("raw_material_stock_movement")).isEqualTo(3);

        var csrfCookie = csrfCookie(session);
        mockMvc.perform(delete("/api/raw-materials/1")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isNoContent());

        // Both of Rose's movements went with it (OQ-5: history is not kept); Ribbon's stayed.
        assertThat(jdbcTemplate.queryForList(
                "SELECT raw_material_id FROM raw_material_stock_movement", Long.class))
                .containsExactly(2L);
    }

    // @trace FR-56
    @Test
    void acceptsRawMaterialsWithTheSameName() throws Exception {
        var session = signedInSession();

        postRawMaterial(session, "Rose", "", "PIECE", "1", "1").andExpect(status().isCreated());
        postRawMaterial(session, "Rose", "", "BUNCH", "2", "3").andExpect(status().isCreated());
        postRawMaterial(session, "ROSE", "", "PIECE", "0", null).andExpect(status().isCreated());

        mockMvc.perform(get("/api/raw-materials").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
        assertThat(jdbcTemplate.queryForList("SELECT id FROM raw_material", Long.class))
                .containsExactlyInAnyOrder(1L, 2L, 3L);
    }

    // @trace FR-60
    @Test
    void leavesStockValuationHistoryAndProductionAloneWhenTheReorderLevelChanges() throws Exception {
        var session = signedInSession();
        var csrfCookie = csrfCookie(session);
        postRawMaterial(session, "Rose", "", "PIECE", "10", "2").andExpect(status().isCreated());
        saveProduct(HttpMethod.POST, "/api/products", session, csrfCookie, "ROSE-BOX", "Rose Box", 1)
                .andExpect(status().isCreated());

        // The level (50) is far above the quantity (10): the material is flagged, nothing else moves.
        putRawMaterial(session, 1, "Rose", "PIECE", "50")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reorderLevel").value(50))
                .andExpect(jsonPath("$.belowReorderLevel").value(true))
                .andExpect(jsonPath("$.quantity").value(10))
                .andExpect(jsonPath("$.averageUnitCost").value(2))
                .andExpect(jsonPath("$.stockValue").value(20));
        assertThat(rowCount("raw_material_stock_movement")).isEqualTo(1);

        // A low-stock material can still be produced from and written off.
        postJson(session, "/api/products/1/production", """
                {"quantity": 1, "productionDate": "2026-07-21"}""")
                .andExpect(status().isOk());
        assertMaterialQuantity("Rose", "9");
        postJson(session, "/api/raw-materials/1/write-offs", """
                {"quantity": 9, "operationDate": "2026-07-21", "reason": "Wilted"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(0));
    }

    // @trace FR-61
    @Test
    void rejectsInvalidReceiptsAndRecordsNothing() throws Exception {
        var session = signedInSession();
        postRawMaterial(session, "Rose", "", "PIECE", "5", "2").andExpect(status().isCreated());
        var receipts = "/api/raw-materials/1/receipts";

        postJson(session, receipts, """
                {"receivedQuantity": 0, "unitPurchaseCost": 1, "receiptDate": "2026-07-19"}""")
                .andExpect(status().isBadRequest());
        postJson(session, receipts, """
                {"receivedQuantity": -2, "unitPurchaseCost": 1, "receiptDate": "2026-07-19"}""")
                .andExpect(status().isBadRequest());
        postJson(session, receipts, """
                {"unitPurchaseCost": 1, "receiptDate": "2026-07-19"}""")
                .andExpect(status().isBadRequest());
        postJson(session, receipts, """
                {"receivedQuantity": 1, "unitPurchaseCost": -0.01, "receiptDate": "2026-07-19"}""")
                .andExpect(status().isBadRequest());
        postJson(session, receipts, """
                {"receivedQuantity": 1, "receiptDate": "2026-07-19"}""")
                .andExpect(status().isBadRequest());
        postJson(session, receipts, """
                {"receivedQuantity": 1, "unitPurchaseCost": 1}""")
                .andExpect(status().isBadRequest());
        postJson(session, receipts, """
                {"receivedQuantity": 1, "unitPurchaseCost": 1, "receiptDate": "2026-07-19", "notes": "%s"}"""
                .formatted("n".repeat(1001)))
                .andExpect(status().isBadRequest());

        assertMaterialQuantity("Rose", "5");
        assertThat(rowCount("raw_material_stock_movement")).isEqualTo(1);

        // A free delivery with notes at the 1000-character limit is accepted.
        postJson(session, receipts, """
                {"receivedQuantity": 1, "unitPurchaseCost": 0, "receiptDate": "2026-07-19", "notes": "%s"}"""
                .formatted("n".repeat(1000)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(6));
        assertThat(rowCount("raw_material_stock_movement")).isEqualTo(2);
    }

    // @trace FR-67
    @Test
    void rejectsAnAdjustmentEqualToTheRecordedRawMaterialQuantity() throws Exception {
        var session = signedInSession();
        postRawMaterial(session, "Rose", "", "PIECE", "5", "2").andExpect(status().isCreated());

        postJson(session, "/api/raw-materials/1/adjustments", """
                {"actualQuantity": 5, "operationDate": "2026-07-19", "reason": "Count"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid data"))
                .andExpect(jsonPath("$.detail").value("Actual stock already matches the recorded raw material stock"));

        assertMaterialQuantity("Rose", "5");
        assertThat(rowCount("raw_material_stock_movement")).isEqualTo(1);

        // One unit of difference is accepted and recorded.
        postJson(session, "/api/raw-materials/1/adjustments", """
                {"actualQuantity": 4, "operationDate": "2026-07-19", "reason": "Count"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(4));
        assertThat(rowCount("raw_material_stock_movement")).isEqualTo(2);
    }

    private ResultActions postRawMaterial(
            MockHttpSession session,
            String name,
            String description,
            String unit,
            String quantity,
            String initialUnitCost) throws Exception {
        var csrfCookie = csrfCookie(session);
        var request = multipart("/api/raw-materials")
                .param("name", name)
                .param("description", description)
                .param("unit", unit)
                .param("quantity", quantity);
        if (initialUnitCost != null) {
            request.param("initialUnitCost", initialUnitCost);
        }
        return mockMvc.perform(request
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()));
    }

    private ResultActions putRawMaterial(
            MockHttpSession session, long id, String name, String unit, String reorderLevel) throws Exception {
        var csrfCookie = csrfCookie(session);
        var request = multipart(HttpMethod.PUT, "/api/raw-materials/" + id)
                .param("name", name)
                .param("unit", unit);
        if (reorderLevel != null) {
            request.param("reorderLevel", reorderLevel);
        }
        return mockMvc.perform(request
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()));
    }

    private int rowCount(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    // @trace FR-76
    @Test
    void enforcesProductFieldLengthsAndWholeNumberQuantities() throws Exception {
        insertRawMaterial(1, "Rose", "PIECE", "10", "5");
        var session = signedInSession();

        postProduct(session, ROSE_RECIPE,
                "sku", "S".repeat(60), "name", "N".repeat(120), "description", "D".repeat(1000))
                .andExpect(status().isCreated());
        for (var invalid : List.of(
                new String[] {"sku", "S".repeat(61)},
                new String[] {"sku", "  "},
                new String[] {"name", "N".repeat(121)},
                new String[] {"description", "D".repeat(1001)},
                new String[] {"quantity", "1.5", "initialUnitCost", "10"},
                new String[] {"quantity", "-1", "initialUnitCost", "10"},
                new String[] {"quantity", "1234567890123", "initialUnitCost", "10"})) {
            postProduct(session, ROSE_RECIPE, invalid)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.title").value("Validation error"));
        }

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product", Integer.class)).isEqualTo(1);
    }

    // @trace FR-79
    @Test
    void validatesTheRecipeOnTheServerWhenCreatingAndUpdatingAProduct() throws Exception {
        insertRawMaterial(1, "Rose", "PIECE", "10", "5");
        insertRawMaterial(2, "Ribbon", "METER", "10", "2");
        var session = signedInSession();

        for (var invalid : List.of(
                "[]",
                "[{\"rawMaterialId\":1,\"quantityPerUnit\":0}]",
                "[{\"rawMaterialId\":1,\"quantityPerUnit\":-1}]",
                "[{\"quantityPerUnit\":1}]",
                "[{\"rawMaterialId\":1}]")) {
            postProduct(session, invalid)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.title").value("Validation error"));
        }
        postProduct(session, "[{\"rawMaterialId\":1,\"quantityPerUnit\":1},{\"rawMaterialId\":1,\"quantityPerUnit\":2}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Each raw material can appear only once in a product recipe"));
        postProduct(session, "[{\"rawMaterialId\":999,\"quantityPerUnit\":1}]")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Raw material with id 999 not found"));
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product", Integer.class)).isZero();

        postProduct(session, ROSE_RECIPE).andExpect(status().isCreated());
        putProduct(session, 1, "[]", "name", "Renamed").andExpect(status().isBadRequest());
        putProduct(session, 1, "[{\"rawMaterialId\":2,\"quantityPerUnit\":0}]", "name", "Renamed")
                .andExpect(status().isBadRequest());
        putProduct(session, 1, "[{\"rawMaterialId\":999,\"quantityPerUnit\":1}]", "name", "Renamed")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Raw material with id 999 not found"));

        assertThat(jdbcTemplate.queryForObject("SELECT name FROM product WHERE id = 1", String.class))
                .isEqualTo("Box");
        assertThat(jdbcTemplate.queryForList("SELECT raw_material_id FROM product_recipe_item WHERE product_id = 1", Long.class))
                .containsExactly(1L);
    }

    // @trace FR-80
    @Test
    void requiresAnInitialUnitCostForPositiveOpeningStockOnTheServer() throws Exception {
        insertRawMaterial(1, "Rose", "PIECE", "10", "5");
        var session = signedInSession();

        postProduct(session, ROSE_RECIPE, "quantity", "2")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(
                        "Initial unit cost is required when initial stock is greater than zero"));
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product", Integer.class)).isZero();

        postProduct(session, ROSE_RECIPE, "sku", "EMPTY-1", "quantity", "0")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(0))
                .andExpect(jsonPath("$.averageUnitCost").value(0));
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product_stock_movement", Integer.class)).isZero();

        postProduct(session, ROSE_RECIPE, "sku", "OPEN-1", "quantity", "2", "initialUnitCost", "100")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.averageUnitCost").value(100));
        assertThat(jdbcTemplate.queryForMap(
                "SELECT movement_type, notes FROM product_stock_movement"))
                .containsEntry("movement_type", "OPENING_BALANCE")
                .containsEntry("notes", "Initial product stock");
        assertMaterialQuantity("Rose", "10");
    }

    // @trace FR-83
    @Test
    void answers404WhenUpdatingAnUnknownProductAndNeverChangesStockOnUpdate() throws Exception {
        insertRawMaterial(1, "Rose", "PIECE", "10", "5");
        var session = signedInSession();

        putProduct(session, 9999, ROSE_RECIPE)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Record not found"))
                .andExpect(jsonPath("$.detail").value("Product with id 9999 not found"));
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product", Integer.class)).isZero();

        postProduct(session, ROSE_RECIPE, "quantity", "2", "initialUnitCost", "20").andExpect(status().isCreated());
        putProduct(session, 1, ROSE_RECIPE,
                "name", "Renamed", "quantity", "99", "initialUnitCost", "99")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed"))
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.averageUnitCost").value(20));
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product_stock_movement", Integer.class))
                .isEqualTo(1);
    }

    // @trace FR-85
    @Test
    void removesTheRecipeBatchesAndMovementsOfADeletedUnsoldProduct() throws Exception {
        insertRawMaterial(1, "Rose", "PIECE", "10", "5");
        var session = signedInSession();
        postProduct(session, "[{\"rawMaterialId\":1,\"quantityPerUnit\":2}]", "quantity", "2", "initialUnitCost", "20")
                .andExpect(status().isCreated());
        postJson(session, "/api/products/1/production", "{\"quantity\":1,\"productionDate\":\"2026-07-21\"}")
                .andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product_recipe_item", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product_stock_movement", Integer.class))
                .isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM production_batch", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM production_consumption", Integer.class))
                .isEqualTo(1);

        var csrfCookie = csrfCookie(session);
        mockMvc.perform(delete("/api/products/1")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isNoContent());

        for (var table : List.of(
                "product", "product_recipe_item", "product_stock_movement", "production_batch",
                "production_consumption")) {
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class))
                    .as(table)
                    .isZero();
        }
        assertMaterialQuantity("Rose", "8");
    }

    // @trace FR-88
    @Test
    void rejectsProductionOfAProductWithoutARecipe() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 3, "40", "20");
        var session = signedInSession();

        postJson(session, "/api/products/1/production", "{\"quantity\":1,\"productionDate\":\"2026-07-21\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid data"))
                .andExpect(jsonPath("$.detail").value("Add at least one raw material to the product recipe"));

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM production_batch", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product_stock_movement", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("3");
    }

    // @trace FR-93
    @Test
    void keepsPastBatchesUnchangedWhenTheRecipeIsEditedLater() throws Exception {
        insertRawMaterial(1, "Rose", "PIECE", "20", "10");
        insertRawMaterial(2, "Ribbon", "METER", "30", "4");
        var session = signedInSession();
        postProduct(session, "[{\"rawMaterialId\":1,\"quantityPerUnit\":2}]", "advertisingCostPerUnit", "5")
                .andExpect(status().isCreated());
        postJson(session, "/api/products/1/production", "{\"quantity\":3,\"productionDate\":\"2026-07-21\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(3))
                .andExpect(jsonPath("$.averageUnitCost").value(25));
        var batchBefore = jdbcTemplate.queryForMap("SELECT * FROM production_batch WHERE id = 1");
        var consumptionBefore = jdbcTemplate.queryForMap("SELECT * FROM production_consumption WHERE id = 1");
        assertThat(new BigDecimal(batchBefore.get("advertising_cost").toString())).isEqualByComparingTo("15");

        putProduct(session, 1, "[{\"rawMaterialId\":2,\"quantityPerUnit\":3}]", "advertisingCostPerUnit", "8")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(3))
                .andExpect(jsonPath("$.averageUnitCost").value(25));

        assertThat(jdbcTemplate.queryForMap("SELECT * FROM production_batch WHERE id = 1")).isEqualTo(batchBefore);
        assertThat(jdbcTemplate.queryForMap("SELECT * FROM production_consumption WHERE id = 1"))
                .isEqualTo(consumptionBefore);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM production_consumption WHERE production_batch_id = 1 AND raw_material_id = 1",
                BigDecimal.class)).isEqualByComparingTo("6");

        postJson(session, "/api/products/1/production", "{\"quantity\":1,\"productionDate\":\"2026-07-22\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(4))
                .andExpect(jsonPath("$.averageUnitCost").value(23.75));
        assertMaterialQuantity("Rose", "14");
        assertMaterialQuantity("Ribbon", "27");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT total_cost FROM production_batch WHERE id = 2", BigDecimal.class))
                .isEqualByComparingTo("20");
        assertThat(jdbcTemplate.queryForMap("SELECT * FROM production_batch WHERE id = 1")).isEqualTo(batchBefore);
    }

    // @trace FR-97
    @Test
    void rejectsFractionalProductAdjustmentsAndWriteOffsOverHttp() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 3, "40", "20");
        var session = signedInSession();

        postJson(session, "/api/products/1/adjustments",
                "{\"actualQuantity\":2.5,\"operationDate\":\"2026-07-21\",\"reason\":\"Count\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid data"))
                .andExpect(jsonPath("$.detail").value("Actual Product stock must be a whole number"));
        postJson(session, "/api/products/1/write-offs",
                "{\"quantity\":1.5,\"operationDate\":\"2026-07-21\",\"reason\":\"Wilted\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Write-off quantity must be a whole number"));

        assertThat(jdbcTemplate.queryForObject("SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("3");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product_stock_movement", Integer.class)).isZero();
    }

    // @trace FR-98
    @Test
    void adjustsProductStockUpWithoutConsumingRawMaterials() throws Exception {
        insertRawMaterial(1, "Rose", "PIECE", "10", "5");
        insertProduct(1, "BOX-1", "Box one", 3, "40", "20");
        jdbcTemplate.update(
                "INSERT INTO product_recipe_item (product_id, raw_material_id, quantity_per_unit) VALUES (1, 1, 2)");
        var session = signedInSession();

        postJson(session, "/api/products/1/adjustments",
                "{\"actualQuantity\":6,\"operationDate\":\"2026-07-21\",\"reason\":\"Count\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(6))
                .andExpect(jsonPath("$.averageUnitCost").value(20));

        var movement = jdbcTemplate.queryForMap(
                "SELECT movement_type, quantity, unit_cost, total_cost FROM product_stock_movement");
        assertThat(movement).containsEntry("movement_type", "ADJUSTMENT_INCREASE");
        assertThat(new BigDecimal(movement.get("quantity").toString())).isEqualByComparingTo("3");
        assertThat(new BigDecimal(movement.get("unit_cost").toString())).isEqualByComparingTo("20");
        assertThat(new BigDecimal(movement.get("total_cost").toString())).isEqualByComparingTo("60");
        assertMaterialQuantity("Rose", "10");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM raw_material_stock_movement", Integer.class))
                .isZero();
    }

    // @trace FR-99
    @Test
    void rejectsAProductAdjustmentEqualToTheCurrentQuantity() throws Exception {
        insertProduct(1, "BOX-1", "Box one", 6, "40", "20");
        var session = signedInSession();

        postJson(session, "/api/products/1/adjustments",
                "{\"actualQuantity\":6,\"operationDate\":\"2026-07-21\",\"reason\":\"Count\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid data"))
                .andExpect(jsonPath("$.detail").value("Actual stock already matches the recorded Product stock"));

        assertThat(jdbcTemplate.queryForObject("SELECT quantity FROM product WHERE id = 1", BigDecimal.class))
                .isEqualByComparingTo("6");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM product_stock_movement", Integer.class)).isZero();
    }

    // @trace FR-33
    @Test
    void forwardsEveryBrowserRouteToTheAngularApplication() throws Exception {
        for (var path : List.of(
                "/", "/login", "/dashboard", "/raw-materials", "/products", "/sales", "/stock-movements",
                "/change-password", "/reports/monthly-sales", "/reports/a/b")) {
            mockMvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(forwardedUrl("/index.html"));
        }
        mockMvc.perform(get("/no-such-route"))
                .andExpect(result -> assertThat(result.getResponse().getForwardedUrl()).isNull());
    }

    // @trace FR-73
    @Test
    void servesStoredImagesWithTheirContentTypeAndNoStore() throws Exception {
        var session = signedInSession();
        submitMultipart(HttpMethod.POST, "/api/raw-materials", session,
                List.of(imagePart("rose.png", "image/png", PNG_BYTES)),
                "name", "Rose", "description", "", "unit", "PIECE", "quantity", "1", "initialUnitCost", "1")
                .andExpect(status().isCreated());
        submitMultipart(HttpMethod.POST, "/api/raw-materials", session, List.of(),
                "name", "Moss", "description", "", "unit", "GRAM", "quantity", "1", "initialUnitCost", "1")
                .andExpect(status().isCreated());
        submitMultipart(HttpMethod.POST, "/api/products", session,
                List.of(recipePart(ROSE_RECIPE), imagePart("box.jpg", "image/jpeg", JPEG_BYTES)),
                "sku", "BOX-1", "name", "Box", "quantity", "0", "markupPercentage", "50")
                .andExpect(status().isCreated());
        submitMultipart(HttpMethod.POST, "/api/products", session, List.of(recipePart(ROSE_RECIPE)),
                "sku", "BOX-2", "name", "Plain box", "quantity", "0", "markupPercentage", "50")
                .andExpect(status().isCreated());

        var rawMaterialImage = mockMvc.perform(get("/api/raw-materials/1/image").session(session))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse();
        assertThat(rawMaterialImage.getContentType()).isEqualTo("image/png");
        assertThat(rawMaterialImage.getContentAsByteArray()).isEqualTo(PNG_BYTES);
        var productImage = mockMvc.perform(get("/api/products/1/image").session(session))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse();
        assertThat(productImage.getContentType()).isEqualTo("image/jpeg");
        assertThat(productImage.getContentAsByteArray()).isEqualTo(JPEG_BYTES);

        for (var rawMaterialId : List.of(2, 999)) {
            mockMvc.perform(get("/api/raw-materials/" + rawMaterialId + "/image").session(session))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.title").value("Record not found"))
                    .andExpect(jsonPath("$.detail").value("Raw material image not found"));
        }
        for (var productId : List.of(2, 999)) {
            mockMvc.perform(get("/api/products/" + productId + "/image").session(session))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.title").value("Record not found"))
                    .andExpect(jsonPath("$.detail").value("Product image not found"));
        }
    }

    // @trace FR-74
    @Test
    void keepsTheStoredImageWhenAnUpdateSendsNoNewImage() throws Exception {
        var session = signedInSession();
        submitMultipart(HttpMethod.POST, "/api/raw-materials", session,
                List.of(imagePart("rose.png", "image/png", PNG_BYTES)),
                "name", "Rose", "description", "", "unit", "PIECE", "quantity", "1", "initialUnitCost", "1")
                .andExpect(status().isCreated());
        submitMultipart(HttpMethod.POST, "/api/products", session,
                List.of(recipePart(ROSE_RECIPE), imagePart("box.png", "image/png", PNG_BYTES)),
                "sku", "BOX-1", "name", "Box", "quantity", "0", "markupPercentage", "50")
                .andExpect(status().isCreated());

        var emptyImage = new MockMultipartFile("image", "", "application/octet-stream", new byte[0]);
        for (var files : List.of(List.<MockMultipartFile>of(), List.of(emptyImage))) {
            submitMultipart(HttpMethod.PUT, "/api/raw-materials/1", session, files,
                    "name", "Renamed rose", "unit", "PIECE")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Renamed rose"))
                    .andExpect(jsonPath("$.hasImage").value(true));
            var productFiles = new ArrayList<MockMultipartFile>(files);
            productFiles.add(recipePart(ROSE_RECIPE));
            submitMultipart(HttpMethod.PUT, "/api/products/1", session, productFiles,
                    "sku", "BOX-1", "name", "Renamed box", "markupPercentage", "50")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Renamed box"));
            assertStoredImage("raw_material", PNG_BYTES, "image/png");
            assertStoredImage("product", PNG_BYTES, "image/png");
        }

        submitMultipart(HttpMethod.PUT, "/api/raw-materials/1", session,
                List.of(imagePart("rose.jpg", "image/jpeg", JPEG_BYTES)), "name", "Renamed rose", "unit", "PIECE")
                .andExpect(status().isOk());
        submitMultipart(HttpMethod.PUT, "/api/products/1", session,
                List.of(recipePart(ROSE_RECIPE), imagePart("box.jpg", "image/jpeg", JPEG_BYTES)),
                "sku", "BOX-1", "name", "Renamed box", "markupPercentage", "50")
                .andExpect(status().isOk());
        assertStoredImage("raw_material", JPEG_BYTES, "image/jpeg");
        assertStoredImage("product", JPEG_BYTES, "image/jpeg");
    }

    // @trace FR-149
    @Test
    void refusesNegativeQuantitiesAndCostsAndValuesOutsideTheClosedSetsAtTheDatabase() {
        seedRowsForTheDatabaseRules();

        // Each rule is {table, column, a value it refuses, a value it accepts}.
        assertSoftly(soft -> {
            for (var rule : List.of(
                    new String[] {"raw_material", "quantity", "-1", "0"},
                    new String[] {"raw_material", "average_unit_cost", "-1", "0"},
                    new String[] {"raw_material", "reorder_level", "-1", "0"},
                    new String[] {"product", "quantity", "-1", "0"},
                    new String[] {"product", "price", "-1", "0"},
                    new String[] {"product", "markup_percentage", "-1", "0"},
                    new String[] {"product", "advertising_cost_per_unit", "-1", "0"},
                    new String[] {"product", "average_unit_cost", "-1", "0"},
                    new String[] {"raw_material_stock_movement", "quantity", "0", "1"},
                    new String[] {"raw_material_stock_movement", "unit_cost", "-1", "0"},
                    new String[] {"raw_material_stock_movement", "total_cost", "-1", "0"},
                    new String[] {"raw_material_stock_movement", "movement_type", "'BOGUS'", "'RECEIPT'"},
                    new String[] {"product_stock_movement", "quantity", "0", "1"},
                    new String[] {"product_stock_movement", "unit_cost", "-1", "0"},
                    new String[] {"product_stock_movement", "total_cost", "-1", "0"},
                    new String[] {"product_stock_movement", "movement_type", "'BOGUS'", "'WRITE_OFF'"},
                    new String[] {"sale", "total_revenue", "-1", "0"},
                    new String[] {"sale", "total_cost", "-1", "0"},
                    new String[] {"sale", "payment_method", "'BARTER'", "'CARD'"},
                    new String[] {"sale", "status", "'BOGUS'", "'COMPLETED'"},
                    new String[] {"sale_item", "quantity", "0", "1"},
                    new String[] {"sale_item", "unit_price", "-1", "0"},
                    new String[] {"sale_return", "total_refund", "-1", "0"},
                    new String[] {"sale_return", "total_cost", "-1", "0"},
                    new String[] {"sale_return", "operation_type", "'REFUND'", "'CANCELLATION'"})) {
                var table = rule[0];
                var column = rule[1];
                jdbcTemplate.update("UPDATE %s SET %s = %s WHERE id = 1".formatted(table, column, rule[3]));
                soft.assertThatThrownBy(() -> jdbcTemplate.update(
                                "UPDATE %s SET %s = %s WHERE id = 1".formatted(table, column, rule[2])))
                        .as(table + "." + column)
                        .isInstanceOf(DataIntegrityViolationException.class);
                soft.assertThat(jdbcTemplate.queryForObject(
                                "SELECT CAST(%s AS TEXT) FROM %s WHERE id = 1".formatted(column, table), String.class))
                        .as(table + "." + column + " kept its accepted value")
                        .isEqualTo(rule[3].replace("'", ""));
            }
        });
    }

    // @trace FR-149
    @Test
    void refusesDuplicateSaleAndReturnNumbersIgnoringCaseAtTheDatabase() {
        seedRowsForTheDatabaseRules();

        assertThatThrownBy(() -> insertSale("SALE-20260721-0001", "2026-07-21", "CASH", "1", "1", "0", "1", "1"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertSale("sale-20260721-0001", "2026-07-21", "CASH", "1", "1", "0", "1", "1"))
                .isInstanceOf(DataIntegrityViolationException.class);
        for (var returnNumber : List.of("RET-20260721-0001", "ret-20260721-0001")) {
            assertThatThrownBy(() -> jdbcTemplate.update("""
                    INSERT INTO sale_return
                        (sale_id, return_number, return_date, operation_type, reason,
                         total_refund, total_cost, gross_profit_reversal)
                    VALUES (1, ?, '2026-07-21', 'RETURN', 'Damaged', 1, 1, 0)
                    """, returnNumber))
                    .as(returnNumber)
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThat(rowCount("sale")).isEqualTo(1);
        assertThat(rowCount("sale_return")).isEqualTo(1);
    }

    // @trace FR-149
    @Test
    void refusesToDeleteRowsThatOtherRowsReferenceAtTheDatabase() {
        seedRowsForTheDatabaseRules();

        // A product with a sale item, a raw material in a recipe, and a sale with a return.
        assertSoftly(soft -> {
            for (var delete : List.of(
                    "DELETE FROM product WHERE id = 1",
                    "DELETE FROM raw_material WHERE id = 1",
                    "DELETE FROM sale WHERE id = 1")) {
                soft.assertThatThrownBy(() -> jdbcTemplate.update(delete))
                        .as(delete)
                        .isInstanceOf(DataIntegrityViolationException.class);
            }
        });
        assertThat(rowCount("product")).isEqualTo(1);
        assertThat(rowCount("raw_material")).isEqualTo(1);
        assertThat(rowCount("sale")).isEqualTo(1);
    }

    // @trace FR-149
    @Test
    void keepsForeignKeysOnAtTheDatabase() {
        seedRowsForTheDatabaseRules();

        assertThat(jdbcTemplate.queryForObject("PRAGMA foreign_keys", Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO product_recipe_item (product_id, raw_material_id, quantity_per_unit) VALUES (999, 1, 1)"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO product_stock_movement
                    (product_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                VALUES (999, 'WRITE_OFF', 1, 1, 1, '2026-07-21')
                """)).isInstanceOf(DataIntegrityViolationException.class);
    }

    // @trace FR-81, FR-91
    @Test
    void keepsAProductsStoredPriceWhenARawMaterialCostChangesAndUsesTheNewCostOnTheNextSaveAndBatch() throws Exception {
        // OQ-1, answered by the owner: the price is fixed when the product is saved from the costs of that moment; a later
        // receipt does not move it, and the new cost reaches the next batch and the next save of the product.
        insertRawMaterial(1, "Rose", "PIECE", "10", "10");
        var session = signedInSession();
        var recipe = "[{\"rawMaterialId\":1,\"quantityPerUnit\":2}]";
        postProduct(session, recipe)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sellingPrice").value(30));

        // Ten more roses at 20 move the average cost from 10 to 15.
        postJson(session, "/api/raw-materials/1/receipts", """
                {"receivedQuantity": 10, "unitPurchaseCost": 20, "receiptDate": "2026-07-21"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.averageUnitCost").value(15));
        mockMvc.perform(get("/api/products").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sellingPrice").value(30));

        // The next batch is costed at the new average: 2 roses at 15.
        postJson(session, "/api/products/1/production", "{\"quantity\":1,\"productionDate\":\"2026-07-22\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.averageUnitCost").value(30))
                .andExpect(jsonPath("$.sellingPrice").value(30));

        // Saving the product again prices it at the new cost: 2 roses at 15, markup 50 percent.
        putProduct(session, 1, recipe)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sellingPrice").value(45));
        mockMvc.perform(get("/api/products").session(session))
                .andExpect(jsonPath("$[0].sellingPrice").value(45));
    }

    private ResultActions login(String password) throws Exception {
        return login("admin", password);
    }

    private ResultActions login(String username, String password) throws Exception {
        return login(username, password, null);
    }

    private ResultActions login(String username, String password, MockHttpSession session) throws Exception {
        var csrfResponse = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        var csrfCookie = csrfResponse.getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        var request = post("/api/auth/login")
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"username":"%s","password":"%s"}
                        """.formatted(username, password));
        if (session != null) {
            request.session(session);
        }
        return mockMvc.perform(request);
    }

    private void insertProduct(
            long id, String sku, String name, int quantity, String price, String averageUnitCost) {
        jdbcTemplate.update("""
                INSERT INTO product
                    (id, sku, name, description, quantity, price, average_unit_cost)
                VALUES (%d, '%s', '%s', '', %d, %s, %s)
                """.formatted(id, sku, name, quantity, price, averageUnitCost));
    }

    private ResultActions postJson(MockHttpSession session, String path, String json) throws Exception {
        var csrfCookie = csrfCookie(session);
        return mockMvc.perform(post(path)
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private static String saleItem(long productId, String quantity, String unitPrice) {
        return """
                {"productId":%d,"quantity":%s,"unitPrice":%s}""".formatted(productId, quantity, unitPrice);
    }

    private static String returnItem(long saleItemId, String quantity) {
        return """
                {"saleItemId":%d,"quantity":%s}""".formatted(saleItemId, quantity);
    }

    private ResultActions postSale(MockHttpSession session, String saleDate, String items) throws Exception {
        return postJson(session, "/api/sales", """
                {"saleDate":"%s","paymentMethod":"CASH","items":[%s]}
                """.formatted(saleDate, items));
    }

    private long createSale(MockHttpSession session, String saleDate, long productId, int quantity, String unitPrice)
            throws Exception {
        var body = postSale(session, saleDate, saleItem(productId, String.valueOf(quantity), unitPrice))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return Long.parseLong(body.replaceFirst("(?s).*?\"id\":(\\d+).*", "$1"));
    }

    private long firstItemId(long saleId) {
        return jdbcTemplate.queryForObject("SELECT MIN(id) FROM sale_item WHERE sale_id = ?", Long.class, saleId);
    }

    private ResultActions postReturn(
            MockHttpSession session, long saleId, String returnDate, String reason, String items)
            throws Exception {
        return postJson(session, "/api/sales/%d/returns".formatted(saleId), """
                {"returnDate":"%s","reason":"%s","items":[%s]}
                """.formatted(returnDate, reason, items));
    }

    private ResultActions cancelSale(MockHttpSession session, long saleId, String cancellationDate)
            throws Exception {
        return postJson(session, "/api/sales/%d/cancellation".formatted(saleId), """
                {"cancellationDate":"%s","reason":"Mistake"}
                """.formatted(cancellationDate));
    }

    private MockHttpSession signedInSession() throws Exception {
        return (MockHttpSession) login(testPassword)
                .andExpect(status().isOk())
                .andReturn()
                .getRequest()
                .getSession(false);
    }

    private Cookie csrfCookie(MockHttpSession session) throws Exception {
        var csrfCookie = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();
        return csrfCookie;
    }

    private ResultActions changePassword(
            MockHttpSession session, String currentPassword, String newPassword, String confirmation)
            throws Exception {
        var csrfCookie = csrfCookie(session);
        return mockMvc.perform(post("/api/auth/change-password")
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
                        """.formatted(currentPassword, newPassword, confirmation)));
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

    private ResultActions createRawMaterialWithReorderLevel(
            MockHttpSession session,
            jakarta.servlet.http.Cookie csrfCookie,
            String name,
            String quantity,
            String reorderLevel) throws Exception {
        return mockMvc.perform(multipart("/api/raw-materials")
                .param("name", name)
                .param("description", "")
                .param("unit", "PIECE")
                .param("quantity", quantity)
                .param("initialUnitCost", "1")
                .param("reorderLevel", reorderLevel)
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()));
    }

    private void assertSellingPrice(
            MockHttpSession session,
            jakarta.servlet.http.Cookie csrfCookie,
            String sku,
            long rawMaterialId,
            String quantityPerUnit,
            String markupPercentage,
            double expectedPrice) throws Exception {
        var recipe = new MockMultipartFile(
                "recipe",
                "recipe.json",
                MediaType.APPLICATION_JSON_VALUE,
                """
                [{"rawMaterialId":%d,"quantityPerUnit":%s}]
                """.formatted(rawMaterialId, quantityPerUnit).getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/products")
                        .file(recipe)
                        .param("sku", sku)
                        .param("name", sku)
                        .param("quantity", "0")
                        .param("markupPercentage", markupPercentage)
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sellingPrice").value(expectedPrice));
    }

    private ResultActions updateRawMaterial(
            MockHttpSession session,
            jakarta.servlet.http.Cookie csrfCookie,
            long id,
            String name,
            String unit) throws Exception {
        return mockMvc.perform(multipart(HttpMethod.PUT, "/api/raw-materials/" + id)
                .param("name", name)
                .param("unit", unit)
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()));
    }

    private ResultActions saveProduct(
            HttpMethod method,
            String path,
            MockHttpSession session,
            jakarta.servlet.http.Cookie csrfCookie,
            String sku,
            String name,
            long recipeMaterialId) throws Exception {
        var recipe = new MockMultipartFile(
                "recipe",
                "recipe.json",
                MediaType.APPLICATION_JSON_VALUE,
                """
                [{"rawMaterialId":%d,"quantityPerUnit":1}]
                """.formatted(recipeMaterialId).getBytes(StandardCharsets.UTF_8));
        return mockMvc.perform(multipart(method, path)
                .file(recipe)
                .param("sku", sku)
                .param("name", name)
                .param("quantity", "2")
                .param("initialUnitCost", "20")
                .param("markupPercentage", "50")
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()));
    }

    /** One valid row in each table the database rules apply to, for the FR-149 tests. */
    private void seedRowsForTheDatabaseRules() {
        insertRawMaterial(1, "Rose", "PIECE", "10", "5");
        insertProduct(1, "ROSE-BOX-001", "Rose Box", 5, "250", "150");
        jdbcTemplate.update(
                "INSERT INTO product_recipe_item (product_id, raw_material_id, quantity_per_unit) VALUES (1, 1, 2)");
        jdbcTemplate.update("""
                INSERT INTO raw_material_stock_movement
                    (raw_material_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                VALUES (1, 'RECEIPT', 1, 5, 5, '2026-07-21')
                """);
        jdbcTemplate.update("""
                INSERT INTO product_stock_movement
                    (product_id, movement_type, quantity, unit_cost, total_cost, occurred_at)
                VALUES (1, 'WRITE_OFF', 1, 150, 150, '2026-07-21')
                """);
        insertSale("SALE-20260721-0001", "2026-07-21", "CASH", "250", "150", "100", "1", "250");
        jdbcTemplate.update("""
                INSERT INTO sale_return
                    (sale_id, return_number, return_date, operation_type, reason,
                     total_refund, total_cost, gross_profit_reversal)
                VALUES (1, 'RET-20260721-0001', '2026-07-21', 'RETURN', 'Damaged', 250, 150, 100)
                """);
    }

    private static final byte[] PNG_BYTES = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00};
    private static final byte[] JPEG_BYTES = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00};

    private static MockMultipartFile imagePart(String filename, String contentType, byte[] bytes) {
        return new MockMultipartFile("image", filename, contentType, bytes);
    }

    private static MockMultipartFile recipePart(String recipeJson) {
        return new MockMultipartFile(
                "recipe", "recipe.json", MediaType.APPLICATION_JSON_VALUE, recipeJson.getBytes(StandardCharsets.UTF_8));
    }

    /** Sends a multipart form with the given file parts; {@code params} are name/value pairs. */
    private ResultActions submitMultipart(
            HttpMethod method, String path, MockHttpSession session, List<MockMultipartFile> files, String... params)
            throws Exception {
        var csrfCookie = csrfCookie(session);
        var builder = multipart(method, path);
        for (var file : files) {
            builder.file(file);
        }
        for (int i = 0; i < params.length; i += 2) {
            builder.param(params[i], params[i + 1]);
        }
        return mockMvc.perform(builder
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()));
    }

    private void assertStoredImage(String table, byte[] bytes, String contentType) {
        var row = jdbcTemplate.queryForMap("SELECT image, image_content_type FROM %s WHERE id = 1".formatted(table));
        assertThat((byte[]) row.get("image")).as(table).isEqualTo(bytes);
        assertThat(row.get("image_content_type")).as(table).isEqualTo(contentType);
    }

    private static final String ROSE_RECIPE = "[{\"rawMaterialId\":1,\"quantityPerUnit\":1}]";

    private void insertRawMaterial(long id, String name, String unit, String quantity, String averageUnitCost) {
        jdbcTemplate.update("""
                INSERT INTO raw_material (id, name, description, unit, quantity, average_unit_cost)
                VALUES (?, ?, '', ?, ?, ?)
                """, id, name, unit, quantity, averageUnitCost);
    }

    /** Posts the multipart product form; {@code overrides} are name/value pairs replacing the defaults. */
    private ResultActions postProduct(MockHttpSession session, String recipeJson, String... overrides)
            throws Exception {
        return submitProduct(HttpMethod.POST, "/api/products", session, recipeJson, overrides);
    }

    private ResultActions putProduct(MockHttpSession session, long id, String recipeJson, String... overrides)
            throws Exception {
        return submitProduct(HttpMethod.PUT, "/api/products/" + id, session, recipeJson, overrides);
    }

    private ResultActions submitProduct(
            HttpMethod method, String path, MockHttpSession session, String recipeJson, String... overrides)
            throws Exception {
        var form = new LinkedHashMap<String, String>();
        form.put("sku", "BOX-1");
        form.put("name", "Box");
        form.put("quantity", "0");
        form.put("markupPercentage", "50");
        for (int i = 0; i < overrides.length; i += 2) {
            form.put(overrides[i], overrides[i + 1]);
        }
        var csrfCookie = csrfCookie(session);
        var builder = multipart(method, path)
                .file(new MockMultipartFile(
                        "recipe", "recipe.json", MediaType.APPLICATION_JSON_VALUE,
                        recipeJson.getBytes(StandardCharsets.UTF_8)));
        form.forEach((name, value) -> builder.param(name, value));
        return mockMvc.perform(builder
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()));
    }

    private void assertMaterialQuantity(String name, String expected) {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM raw_material WHERE name = ?",
                BigDecimal.class,
                name)).isEqualByComparingTo(expected);
    }

    private void insertSale(
            String saleNumber,
            String saleDate,
            String paymentMethod,
            String revenue,
            String cost,
            String profit,
            String quantity,
            String unitPrice) {
        jdbcTemplate.update(
                """
                INSERT INTO sale
                    (sale_number, sale_date, payment_method, notes,
                     total_revenue, total_cost, gross_profit)
                VALUES (?, ?, ?, '', ?, ?, ?)
                """,
                saleNumber,
                saleDate,
                paymentMethod,
                revenue,
                cost,
                profit);
        var saleId = jdbcTemplate.queryForObject(
                "SELECT id FROM sale WHERE sale_number = ?",
                Long.class,
                saleNumber);
        jdbcTemplate.update(
                """
                INSERT INTO sale_item
                    (sale_id, product_id, product_sku, product_name, quantity,
                     recommended_unit_price, unit_price, unit_cost,
                     line_revenue, line_cost, line_profit)
                VALUES (?, 1, 'ROSE-BOX-001', 'Rose Box', ?, 250, ?, 150, ?, ?, ?)
                """,
                saleId,
                quantity,
                unitPrice,
                revenue,
                cost,
                profit);
    }
}
