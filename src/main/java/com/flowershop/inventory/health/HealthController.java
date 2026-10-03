package com.flowershop.inventory.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public liveness check, so it reports nothing but the status. */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    @GetMapping
    public HealthStatus health() {
        return new HealthStatus("UP");
    }

    public record HealthStatus(String status) {
    }
}
