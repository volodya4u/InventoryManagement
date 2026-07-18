package com.flowershop.inventory.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.flowershop.inventory.common.InvalidImageException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class ImageValidatorTest {

    private final ImageValidator validator = new ImageValidator(2 * 1024 * 1024);

    @Test
    void acceptsPngByExtensionMimeAndSignature() {
        byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00};
        var file = new MockMultipartFile("image", "rose.png", "image/png", png);

        var result = validator.validate(file);

        assertThat(result.contentType()).isEqualTo("image/png");
        assertThat(result.bytes()).isEqualTo(png);
    }

    @Test
    void rejectsRenamedNonImage() {
        var file = new MockMultipartFile(
                "image",
                "not-really-a-rose.jpg",
                "image/jpeg",
                "plain text".getBytes());

        assertThatThrownBy(() -> validator.validate(file))
                .isInstanceOf(InvalidImageException.class)
                .hasMessageContaining("do not match");
    }

    @Test
    void rejectsFilesLargerThanTwoMegabytes() {
        var file = new MockMultipartFile(
                "image",
                "large.png",
                "image/png",
                new byte[2 * 1024 * 1024 + 1]);

        assertThatThrownBy(() -> validator.validate(file))
                .isInstanceOf(InvalidImageException.class)
                .hasMessageContaining("2 MB");
    }
}
