package com.flowershop.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.ConnectException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.util.Collections;
import java.util.UUID;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

// A real embedded server with the default `local` profile on top of the in-memory test database: only a real socket shows
// which addresses the server accepts connections on. `local` supplies the address, `test` supplies the database, and the
// random port replaces 8081. The bootstrap password is generated at run time, never written down.
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:sqlite:file:loopback-binding-test?mode=memory&cache=shared")
@ActiveProfiles({"local", "test"})
class LoopbackBindingHttpTest {

    @DynamicPropertySource
    static void bootstrapAdminPassword(DynamicPropertyRegistry registry) {
        registry.add("app.bootstrap.admin-password", () -> UUID.randomUUID().toString());
    }

    @LocalServerPort
    private int port;

    @Value("${server.address:}")
    private String serverAddress;

    // @trace NFR-23
    @Test
    void listensOnTheLoopbackAddressInTheLocalProfile() throws IOException {
        assertThat(serverAddress).isEqualTo("127.0.0.1");
        try (var socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 2000);
            assertThat(socket.isConnected()).isTrue();
        }
    }

    // @trace NFR-23
    @Test
    void refusesConnectionsOnTheMachinesOtherAddresses() throws Exception {
        var other = firstNonLoopbackIpv4();
        Assumptions.assumeTrue(other != null, "this machine has no non-loopback IPv4 address to try");
        assertThatThrownBy(() -> {
                    try (var socket = new Socket()) {
                        socket.connect(new InetSocketAddress(other, port), 2000);
                    }
                })
                // No connection is made. Linux answers with a refusal; Windows drops the packet to an address nothing listens
                // on, so the attempt times out. Either way the server did not accept it; any other failure (no route, bad
                // address) says nothing about the bind and fails the test. The first test pins `server.address` itself.
                .satisfiesAnyOf(
                        thrown -> assertThat(thrown).isInstanceOf(ConnectException.class),
                        thrown -> assertThat(thrown).isInstanceOf(SocketTimeoutException.class));
    }

    private static InetAddress firstNonLoopbackIpv4() throws Exception {
        for (var nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!nic.isUp() || nic.isLoopback()) continue;
            for (var address : Collections.list(nic.getInetAddresses())) {
                if (address instanceof Inet4Address && !address.isLinkLocalAddress()) return address;
            }
        }
        return null;
    }
}
