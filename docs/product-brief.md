# Product Brief: Flower Shop Inventory (reverse-engineered baseline)

Status: ASSUMPTION. Derived from the shipped code, README, tests and one approved spec on 2026-10-11. The product owner
has not yet ratified it. Numbered requirements are in `docs/requirements.md`.

## Who and how they work

A single flower shop run by one administrator. The shop buys raw materials (flowers, ribbon, moss, packaging,
decorations), assembles finished products from fixed recipes, and sells them. The system runs locally on the owner's
machine (`http://localhost:8081`, SQLite file `flower-shop-local.db`). It has one user, an `ADMIN`. All money is shown
in Ukrainian hryvnia (UAH). The UI is English.

## Pain points the product addresses (inferred from features)

- Knowing what stock exists and what it is worth, when delivery prices change (weighted-average cost).
- Knowing the real cost of a bouquet or box, including advertising cost, so a selling price can be derived from a markup.
- Not running out of materials (reorder level and low-stock flag, added 2026-10-05).
- Recording losses, damage and stock-count corrections without silently editing quantities (audited movements).
- Seeing profit per sale and per month, including returns and cancellations.

## What the platform does end to end

1. Sign in (single administrator), change the password, and be signed out after inactivity.
2. Maintain a **raw material** catalog (unit, optional image, reorder level), receive deliveries, write off, and adjust
   after a physical count.
3. Maintain a **product** catalog with a recipe, advertising cost per unit and markup. The selling price is computed,
   never typed.
4. **Produce** products: raw materials are consumed and product units added in one atomic step, at current weighted cost.
5. **Sell** products (cash, card, bank transfer) at the recommended or an actual price. Revenue, cost and profit are
   frozen in the sale. Later **returns** (partial or full) and **cancellations** are separate numbered documents.
6. Review every stock movement in one filterable, paged **Stock History**.
7. Run the **Monthly Sales** report and export it as CSV.

## MVP versus Future

MVP is everything above, because it is already shipped. No Future phase is declared in the README or the specs.
Declared out of scope (from `docs/specs/raw-material-reorder-level.md`): automatic reordering, supplier notifications,
purchase orders, and a reorder level for finished products.

## Actors and goals

| Actor | Goal |
| --- | --- |
| Shop administrator (the only actor) | Keep stock and costs accurate, price products, record sales and reversals, see monthly results |
| Operator or developer (starts the app) | Provide `APP_ADMIN_INITIAL_PASSWORD` once, start the JAR, check `GET /api/health` |

## Key workflows in prose

**Stocking.** The administrator adds a raw material with an opening quantity and unit cost, then records each delivery
as a receipt. The system blends the new price into the average cost. Damage is a write-off; a stock count is an
adjustment. Each one leaves a movement row.

**Making and selling.** A product's recipe lists materials and quantities per unit. Producing N units checks every
material first; if any is short, nothing changes. Otherwise materials are deducted and the product's average cost is
re-blended. A sale then deducts product stock and snapshots SKU, name, recommended price, actual price and unit cost.

**Reversing.** A return takes back some or all units of a sale (never more than remain). A cancellation reverses a
sale that has had no returns. Both restore stock and are visible in history and in the month they happen.

## Main risks and unknowns

Browsers and devices, performance budgets, availability targets, backup of the SQLite file and accessibility targets are
not declared anywhere. See `## Open questions` in `docs/requirements.md`.
