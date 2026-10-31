## MODIFIED Requirements

### Requirement: Modal keyboard focus

Every modal on the Raw Materials, Products and Sales pages SHALL move keyboard focus inside when opened, keep Tab and Shift+Tab inside it, and return focus to its opener when closed (FR-150, NFR-20).

#### Scenario: Open and close a modal by keyboard

- **GIVEN** a keyboard user focuses a modal opener
- **WHEN** they open the modal, use Tab or Shift+Tab at its ends, then close it
- **THEN** focus enters the modal, wraps within its controls, and returns to the opener
