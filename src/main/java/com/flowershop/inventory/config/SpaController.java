package com.flowershop.inventory.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {

    @GetMapping({
        "/",
        "/login",
        "/dashboard",
        "/raw-materials",
        "/products",
        "/sales",
        "/stock-movements",
        "/change-password",
        "/reports/**"
    })
    public String forwardAngularRoutes() {
        return "forward:/index.html";
    }
}
