package com.flowershop.inventory.reports;

import com.flowershop.inventory.reports.MonthlySalesReportDto.PaymentSummary;
import com.flowershop.inventory.sales.PaymentMethod;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MonthlySalesReportService {

    private static final BigDecimal ZERO_MONEY = new BigDecimal("0.00");

    private final MonthlySalesReportRepository repository;

    public MonthlySalesReportService(MonthlySalesReportRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public MonthlySalesReportDto generate(String monthValue) {
        var month = parseMonth(monthValue);
        var start = month.atDay(1);
        var endExclusive = month.plusMonths(1).atDay(1);
        var salesTotals = repository.findSalesTotals(start, endExclusive);
        var returnTotals = repository.findReturnTotals(start, endExclusive);
        var paymentsByMethod = repository.findPaymentSummaries(start, endExclusive).stream()
                .collect(Collectors.toMap(PaymentSummary::paymentMethod, Function.identity()));
        var paymentSummaries = Arrays.stream(PaymentMethod.values())
                .map(method -> paymentsByMethod.getOrDefault(
                        method,
                        new PaymentSummary(
                                method,
                                0,
                                0,
                                ZERO_MONEY,
                                ZERO_MONEY,
                                ZERO_MONEY,
                                ZERO_MONEY,
                                ZERO_MONEY)))
                .toList();
        var averageSaleValue = salesTotals.salesCount() == 0
                ? ZERO_MONEY
                : salesTotals.grossRevenue().divide(
                        BigDecimal.valueOf(salesTotals.salesCount()),
                        2,
                        RoundingMode.HALF_UP);
        var netRevenue = salesTotals.grossRevenue().subtract(returnTotals.refunds());
        var netCost = salesTotals.grossCost().subtract(returnTotals.returnedCost());

        return new MonthlySalesReportDto(
                month.toString(),
                start,
                endExclusive.minusDays(1),
                salesTotals.salesCount(),
                returnTotals.returnCount(),
                salesTotals.unitsSold().subtract(returnTotals.unitsReturned()),
                returnTotals.unitsReturned(),
                salesTotals.grossRevenue(),
                returnTotals.refunds(),
                netRevenue,
                salesTotals.grossCost(),
                returnTotals.returnedCost(),
                netCost,
                netRevenue.subtract(netCost),
                averageSaleValue,
                paymentSummaries,
                repository.findDailySummaries(start, endExclusive),
                repository.findProductSummaries(start, endExclusive),
                repository.findSales(start, endExclusive),
                repository.findReturns(start, endExclusive));
    }

    private YearMonth parseMonth(String monthValue) {
        try {
            return YearMonth.parse(monthValue);
        } catch (DateTimeParseException | NullPointerException exception) {
            throw new IllegalArgumentException("Month must use the YYYY-MM format");
        }
    }
}
