# Design — nfr-evidence-hardening

## Evidence boundary

Use component tests to interact with each write form, reject an invalid submission before HTTP, and show a server problem message on a valid submission. Existing login and password tests already cover those forms. The added cases cover the inventory and sales dialogs that have no direct error-display assertion.

Read the actual `frontend/src/index.html` from a Java integration test to test the document language without adding Node types to Angular's test configuration. Render date-only API values in Sales, Monthly Sales and Stock History and assert the same calendar day in the existing readable English formats; inspect the sale date input's ISO value separately. Pin the date tests to `Europe/Kyiv` through Vitest's `vi.stubEnv('TZ', ...)` so CI in UTC can still detect the shift. Cover the Sales list, detail and return dates and the report's period, daily, sale and return dates. Angular parses date-only values as local dates, so applying a UTC display timezone can shift them to the previous day. Remove that timezone conversion for date-only display values.

Use the existing MockMvc integration fixture for an actual report response. Check numeric money fields, absence of `currency` and `currencyCode` JSON properties, and the SQLite sale tables' column names. The UAH display assertion already exists in the report component spec.

## Test-first evidence

Most criteria characterize shipped behavior. After each named characterization test is green, use a recorded `break-run.mjs` cycle: change production code or markup so the test fails on its assertion, record the break, and restore the exact starting tree. The date-shift criteria follow an assertion failure on the actual code, then a minimal fix and a green rerun. Commit the replayable evidence with the slice.
