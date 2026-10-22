# Design — sale-price-two-decimals

The New Sale form already prevents a POST when any row control is invalid and marks the form touched on Save. Add the
same `Validators.pattern(/^\d+(\.\d{1,2})?$/)` used by the Products form to `unitPrice`. Its existing `required` and
`min(0)` validators remain.

Place the specific error beneath the unit price input and show it when that control is touched and invalid. A Save
attempt makes it visible through the existing `markAllAsTouched()` path. Keep the general row error for other invalid
fields. No server validation or error handler behavior changes.
