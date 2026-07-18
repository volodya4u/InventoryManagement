package com.flowershop.inventory.image;

import com.flowershop.inventory.common.InvalidImageException;
import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ImageValidator {

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png");
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("image/jpeg", "image/png");

    private final long maxSizeBytes;

    public ImageValidator(@Value("${app.image.max-size-bytes}") long maxSizeBytes) {
        this.maxSizeBytes = maxSizeBytes;
    }

    public ImagePayload validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }
        if (file.getSize() > maxSizeBytes) {
            throw new InvalidImageException("The maximum image size is 2 MB");
        }

        var extension = extensionOf(file.getOriginalFilename());
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new InvalidImageException("Only JPG, JPEG, or PNG files are allowed");
        }

        var contentType = file.getContentType() == null
                ? ""
                : file.getContentType().toLowerCase(Locale.ROOT);
        if (!ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new InvalidImageException("The file MIME type must be image/jpeg or image/png");
        }

        try {
            byte[] bytes = file.getBytes();
            boolean actualJpeg = isJpeg(bytes);
            boolean actualPng = isPng(bytes);
            if (!(actualJpeg || actualPng)) {
                throw new InvalidImageException("The file contents do not match the JPEG or PNG format");
            }
            if (actualJpeg && !contentType.equals("image/jpeg")) {
                throw new InvalidImageException("The JPEG file extension and contents do not match");
            }
            if (actualPng && !contentType.equals("image/png")) {
                throw new InvalidImageException("The PNG file extension and contents do not match");
            }
            return new ImagePayload(bytes, actualPng ? "image/png" : "image/jpeg");
        } catch (IOException exception) {
            throw new InvalidImageException("Unable to read the image");
        }
    }

    private String extensionOf(String filename) {
        if (filename == null) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private boolean isJpeg(byte[] bytes) {
        return bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF;
    }

    private boolean isPng(byte[] bytes) {
        int[] signature = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        if (bytes.length < signature.length) {
            return false;
        }
        for (int index = 0; index < signature.length; index++) {
            if ((bytes[index] & 0xFF) != signature[index]) {
                return false;
            }
        }
        return true;
    }
}
