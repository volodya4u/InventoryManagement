package com.flowershop.inventory.reports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.flowershop.inventory.reports.MonthlySalesReportDto.PaymentSummary;
import com.flowershop.inventory.reports.MonthlySalesReportRepository.ReturnTotals;
import com.flowershop.inventory.reports.MonthlySalesReportRepository.SalesTotals;
import com.flowershop.inventory.sales.PaymentMethod;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class MonthlySalesReportServiceTest {

    private final MonthlySalesReportRepository repository =
            mock(MonthlySalesReportRepository.class);
    private final MonthlySalesReportService service = new MonthlySalesReportService(repository);

    @Test
    void rejectsInvalidMonthBeforeQueryingRepository() {
        assertThatThrownBy(() -> service.generate("2026-13"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Month must use the YYYY-MM format");

        verifyNoInteractions(repository);
    }

    @Test
    void generatesNetTotalsAverageAndZeroFilledPaymentMethods() {
        var start = LocalDate.of(2026, 9, 1);
        var endExclusive = LocalDate.of(2026, 10, 1);
        when(repository.findSalesTotals(start, endExclusive))
                .thenReturn(new SalesTotals(
                        3,
                        new BigDecimal("8"),
                        new BigDecimal("100.00"),
                        new BigDecimal("60.00")));
        when(repository.findReturnTotals(start, endExclusive))
                .thenReturn(new ReturnTotals(
                        1,
                        new BigDecimal("2"),
                        new BigDecimal("25.00"),
                        new BigDecimal("10.00")));
        var cash = new PaymentSummary(
                PaymentMethod.CASH,
                3,
                1,
                new BigDecimal("100.00"),
                new BigDecimal("25.00"),
                new BigDecimal("75.00"),
                new BigDecimal("50.00"),
                new BigDecimal("25.00"));
        when(repository.findPaymentSummaries(start, endExclusive)).thenReturn(List.of(cash));
        when(repository.findDailySummaries(start, endExclusive)).thenReturn(List.of());
        when(repository.findProductSummaries(start, endExclusive)).thenReturn(List.of());
        when(repository.findSales(start, endExclusive)).thenReturn(List.of());
        when(repository.findReturns(start, endExclusive)).thenReturn(List.of());

        var report = service.generate("2026-09");

        assertThat(report.month()).isEqualTo("2026-09");
        assertThat(report.periodStart()).isEqualTo(start);
        assertThat(report.periodEnd()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(report.unitsSold()).isEqualByComparingTo("6");
        assertThat(report.unitsReturned()).isEqualByComparingTo("2");
        assertThat(report.revenue()).isEqualByComparingTo("75.00");
        assertThat(report.totalCost()).isEqualByComparingTo("50.00");
        assertThat(report.grossProfit()).isEqualByComparingTo("25.00");
        assertThat(report.averageSaleValue()).isEqualByComparingTo("33.33");
        assertThat(report.paymentSummaries()).hasSize(PaymentMethod.values().length);
        assertThat(report.paymentSummaries()).first().isSameAs(cash);
        assertThat(report.paymentSummaries().get(1)).satisfies(summary -> {
            assertThat(summary.paymentMethod()).isEqualTo(PaymentMethod.CARD);
            assertThat(summary.salesCount()).isZero();
            assertThat(summary.grossRevenue()).isEqualByComparingTo("0.00");
        });
        verify(repository).findReturns(start, endExclusive);
    }
}
