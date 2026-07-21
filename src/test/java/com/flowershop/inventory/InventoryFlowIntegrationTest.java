package com.flowershop.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
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
                        .param("markupPercentage", "50")
                        .session(session)
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.averageUnitCost").value(100))
                .andExpect(jsonPath("$.stockValue").value(200))
                .andExpect(jsonPath("$.markupPercentage").value(50))
                .andExpect(jsonPath("$.sellingPrice").value(207))
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
