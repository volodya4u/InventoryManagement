package com.flowershop.inventory.reports;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
public class MonthlySalesReportController {

    private final MonthlySalesReportService service;

    public MonthlySalesReportController(MonthlySalesReportService service) {
        this.service = service;
    }

    @GetMapping("/monthly-sales")
    public MonthlySalesReportDto monthlySales(@RequestParam String month) {
        return service.generate(month);
    }
}
