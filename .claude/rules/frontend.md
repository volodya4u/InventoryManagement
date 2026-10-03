---
paths:
  - "frontend/**"
---

# Frontend rules (loaded only when working under `frontend/`)

- Angular 22 defaults to `OnPush` change detection; `ChangeDetectionStrategy.Default` is deprecated in favor of `Eager`.
  Existing components keep the `Eager` the v22 migration added. New components use the `OnPush` default and keep state in signals.
- `HttpClient` defaults to the Fetch backend in v22. Keep `withXhr()` in `app.config.ts`; never add the deprecated `withFetch()`.
- Templates use built-in control flow (`@if`, `@for` with `track`), never `*ngIf`/`*ngFor`. `strictTemplates` is on.
- Quantity and money arithmetic goes through `src/app/core/decimal.ts` (`addDecimals`, `multiplyDecimals`,
  `subtractDecimals`, `wholeQuotient`, `roundHalfUp`), never plain float math.
- Protected pages are child routes of `ShellComponent` behind `authGuard`; show API errors with `apiErrorMessage` from
  `core/api-error.ts`.
- A new route in `app.routes.ts` also needs its path in the backend `SpaController` and a forwarding test in
  `InventoryFlowIntegrationTest`, or reloading that page fails.
