package com.flowershop.inventory.auth;

import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/** Lets the browser expire an idle view without polling and prolonging the session. */
@RestControllerAdvice
public class SessionTimeoutAdvice implements ResponseBodyAdvice<Object> {
    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
            Class<? extends HttpMessageConverter<?>> converterType,
            ServerHttpRequest request, ServerHttpResponse response) {
        if (request instanceof ServletServerHttpRequest servletRequest) {
            var session = servletRequest.getServletRequest().getSession(false);
            if (session != null) {
                response.getHeaders().set("X-Session-Timeout-Seconds",
                        Integer.toString(session.getMaxInactiveInterval()));
            }
        }
        return body;
    }
}
