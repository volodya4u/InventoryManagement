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

    // @trace FR-71
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

    private static final byte[] PNG = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00};

    // @trace FR-70
    @Test
    void rejectsAFileWhoseExtensionIsNotJpgJpegOrPngEvenWithAMatchingMimeTypeAndSignature() {
        for (var filename : new String[] {"rose.gif", "rose.webp", "rose", "rose."}) {
            var file = new MockMultipartFile("image", filename, "image/png", PNG);

            assertThatThrownBy(() -> validator.validate(file))
                    .as(filename)
                    .isInstanceOf(InvalidImageException.class)
                    .hasMessage("Only JPG, JPEG, or PNG files are allowed");
        }
        var unnamed = new MockMultipartFile("image", null, "image/png", PNG);
        assertThatThrownBy(() -> validator.validate(unnamed))
                .isInstanceOf(InvalidImageException.class)
                .hasMessage("Only JPG, JPEG, or PNG files are allowed");
    }

    // @trace FR-70
    @Test
    void rejectsAFileWhoseDeclaredMimeTypeIsNotJpegOrPngEvenWithAMatchingExtensionAndSignature() {
        for (var contentType : new String[] {"image/gif", "application/octet-stream", "text/plain", ""}) {
            var file = new MockMultipartFile("image", "rose.png", contentType, PNG);

            assertThatThrownBy(() -> validator.validate(file))
                    .as(contentType)
                    .isInstanceOf(InvalidImageException.class)
                    .hasMessage("The file MIME type must be image/jpeg or image/png");
        }
    }

    // @trace FR-70
    @Test
    void rejectsAFileWhoseSignatureDisagreesWithItsDeclaredMimeType() {
        var jpegDeclaredAsPng = new MockMultipartFile("image", "rose.png", "image/png", JPEG);
        var pngDeclaredAsJpeg = new MockMultipartFile("image", "rose.jpg", "image/jpeg", PNG);

        assertThatThrownBy(() -> validator.validate(jpegDeclaredAsPng))
                .isInstanceOf(InvalidImageException.class)
                .hasMessage("The JPEG file extension and contents do not match");
        assertThatThrownBy(() -> validator.validate(pngDeclaredAsJpeg))
                .isInstanceOf(InvalidImageException.class)
                .hasMessage("The PNG file extension and contents do not match");
    }

    // @trace FR-70
    @Test
    void acceptsJpgJpegAndUpperCaseExtensionsAndTreatsAnEmptyFileAsNoImage() {
        for (var filename : new String[] {"rose.jpg", "rose.JPEG", "ROSE.Jpg"}) {
            var result = validator.validate(new MockMultipartFile("image", filename, "IMAGE/JPEG", JPEG));

            assertThat(result.contentType()).as(filename).isEqualTo("image/jpeg");
            assertThat(result.bytes()).isEqualTo(JPEG);
        }
        assertThat(validator.validate(new MockMultipartFile("image", "rose.PNG", "image/png", PNG)).contentType())
                .isEqualTo("image/png");
        assertThat(validator.validate(new MockMultipartFile("image", "rose.png", "image/png", new byte[0]))).isNull();
        assertThat(validator.validate(null)).isNull();
    }
}
