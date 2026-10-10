# Images Specification

## Purpose

Describes the optional image of a raw material or product: accepted formats, the size limit, storage as a BLOB, serving,
replacement, and the browser-side check. This is an already-implemented baseline reverse-engineered from the shipped
code and its tests; every requirement is an unratified assumption. Image formats other than JPG, JPEG and PNG are
intentionally unsupported.

## Requirements

### Requirement: Accepted image types

An image SHALL be optional. The server SHALL accept only JPG, JPEG or PNG, and the extension, the declared MIME type
(`image/jpeg` or `image/png`) and the file signature (magic bytes) SHALL all agree; otherwise it SHALL answer 400
"Invalid image" with a specific message (FR-70).

> GAP: the extension-only and MIME-only rejections are not asserted (see docs/requirements.md Coverage gaps, FR-70 row).

#### Scenario: Valid PNG
- **WHEN** a file named `x.png` with MIME `image/png` and PNG signature bytes is uploaded
- **THEN** it is accepted

#### Scenario: Renamed non-image
- **WHEN** a non-image file named `x.png` is uploaded
- **THEN** the response is 400 "Invalid image"

### Requirement: Size limit

The maximum image size SHALL be 2 MB (2,097,152 bytes); a larger file SHALL give 400 "The maximum image size is 2 MB"
(FR-71).

#### Scenario: File over 2 MB
- **WHEN** an image of 2,097,153 bytes is uploaded
- **THEN** the response is 400 "The maximum image size is 2 MB"

### Requirement: Oversized multipart request

A multipart request above the Spring limits (`max-file-size` 2MB, `max-request-size` 3MB) SHALL give 413 "File too
large" with detail "The maximum image size is 2 MB" (FR-72).

> GAP: not asserted by any test (see docs/requirements.md Coverage gaps, FR-72 row).

#### Scenario: Request above 3 MB
- **WHEN** a multipart request larger than 3 MB is sent
- **THEN** the response is 413 "File too large" with detail "The maximum image size is 2 MB"

### Requirement: Storage and serving

The image SHALL be stored as a BLOB with its content type and served by `GET /api/raw-materials/{id}/image` and
`GET /api/products/{id}/image` with that content type and `Cache-Control: no-store`; when none exists the response
SHALL be 404 "Record not found" (FR-73).

> GAP: `no-store`, the product endpoint and the 404 are not asserted; the raw material round trip is (see docs/requirements.md Coverage gaps, FR-73 row).

#### Scenario: Round trip
- **GIVEN** a raw material created with a PNG
- **WHEN** `GET /api/raw-materials/{id}/image` is called
- **THEN** the same bytes are returned with content type `image/png`

#### Scenario: No image
- **WHEN** the image of a record without one is requested
- **THEN** the response is 404 "Record not found"

### Requirement: Keeping and replacing images

Updating without a new image SHALL keep the stored one; there SHALL be no way to remove an image once set (FR-74).

> GAP: not asserted; whether non-removal is intended is unclear (see docs/requirements.md OQ-11 / Coverage gaps, FR-74 row).

#### Scenario: Update without image
- **GIVEN** a product with a stored image
- **WHEN** it is updated without an image part
- **THEN** `hasImage` stays true and the same image is served

### Requirement: Browser-side image check

The browser SHALL apply the same rules before upload (extension, MIME type, 2 MB) and show "Select a JPG, JPEG, or PNG
file." or "The image size cannot exceed 2 MB." (FR-75).

> Covered by slice `harden-frontend-specs`: `frontend/src/app/core/image-file.spec.ts` asserts the client-side image check.

#### Scenario: Wrong type chosen
- **WHEN** the user selects a `.gif` file
- **THEN** the form shows "Select a JPG, JPEG, or PNG file." and nothing is sent

#### Scenario: Too large
- **WHEN** the user selects a PNG over 2 MB
- **THEN** the form shows "The image size cannot exceed 2 MB."
