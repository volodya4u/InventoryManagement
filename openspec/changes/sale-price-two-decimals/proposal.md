# Validate New Sale unit prices to two decimals

## Why

The sale API rejects a unit price with more than two decimals (FR-102), but the New Sale form currently posts it. A
price such as 30.555 therefore fails with a technical server validation error instead of a useful field message.

## What Changes

- Apply the Products form's non-negative, two-decimal pattern to each New Sale unit price (FR-112).
- Show a field-level explanation when the price is invalid.
- Align the FR-112 requirement and sales baseline spec with that form behavior. The server rule in FR-102 stays the same.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a product selected for a New Sale, when its unit price has three decimals and Save is attempted, then the form does not post and shows "Enter a unit price of 0 or more, with at most two decimals." under the field; a price with two decimals remains valid | `frontend/src/app/sales/sales.component.spec.ts` › "does not post a sale whose unit price has more than two decimals" |

## Impact

- Affected requirement and spec: FR-112 and `openspec/specs/sales/spec.md`.
- Affected code: `frontend/src/app/sales/sales.component.ts` and its template and spec.
- No schema, API, dependency, or boundary file changes.
