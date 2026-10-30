# Demo script — Flower Shop Inventory

A walkthrough that shows the shop's whole stock-and-sales cycle in about fifteen minutes, one scene per capability and one
security scene. It is written to be performed live by a person. **The clips in `docs/qa/demo-recordings/` are not this demo:** they are the
Playwright specs in `e2e/` recorded one test at a time (`pnpm run record:demos`, ADR-0010), each proving the requirements it is
tagged with. This script is still the live walkthrough, and each scene below can be checked against the clip whose requirements
it names.

## Setup

- Start from a new empty database (`flower-shop-local.db` moved aside) so the numbers below come out the same every time.
  Restore the real database afterwards.
- Start the app (`Start OnlineStore.cmd`) and open `http://localhost:8081`. The script needs the built
  `target\inventory-0.1.0-SNAPSHOT.jar`, Chrome in its default folder and `APP_ADMIN_INITIAL_PASSWORD` in the environment it
  is started from. The administrator's password is the value given to that variable for the new database. Keep it out of the
  recording and out of any file.
- Use a desktop browser at a normal width, with the language set to English.

## Scene 1 — Sign in (proves FR-1, FR-3, FR-20, FR-21, FR-9)
Open the app. Sign in with a wrong password, then the right one. At the end of the demo, sign out.
**Show:** the message "Invalid username or password" for the wrong attempt; the dashboard after the right one.

## Scene 2 — Raw materials and stock value (proves FR-42, FR-45, FR-46, FR-47, FR-48)
Add Rose (unit Bunch, 20 at 50.00, reorder level 5), Ribbon (Meter, 10 at 8.00) and Wrapping paper (Piece, 30 at 3.00).
**Show:** the list ordered by name, each row's stock value (Ribbon 80.00, Rose 1,000.00, Wrapping paper 90.00) and the total.

## Scene 3 — Receipts and the average cost (proves FR-61, FR-62, FR-63, FR-69)
Record a receipt of 10 Rose bunches at 60.00, then 20 Ribbon metres at 8.00.
**Show:** the Receipt Value in the Receive Stock dialog before saving; then Rose with 30 bunches at an average cost the page
shows as ₴53.33 (the stored value is 53.3333), which is (20 × 50 + 10 × 60) / 30.

## Scene 4 — A product whose price is calculated (proves FR-76, FR-79, FR-81, FR-82)
Create the product `BQ-001` "Rose bouquet": 1 Rose, 2 Ribbon and 1 Wrapping paper per unit, markup 30, advertising cost 0,
opening quantity 0.
**Show:** the live preview of the recipe cost displayed as ₴72.33 (the unrounded calculation value is 72.3333) and the selling
price displayed as ₴94.03 (72.3333 × 1.3, rounded to cents) while the form is filled in. Point out that there is no field to
type a price: it is always cost plus markup, and it stays as saved if a material's cost changes later (decision OQ-1).

## Scene 5 — Production (proves FR-88, FR-89, FR-90, FR-92, FR-94)
Open the production dialog for the bouquet and produce 5. Then try to produce 1000.
**Show:** the dialog counting the materials needed and the cost before producing; after producing, Rose 25, Ribbon 20,
Wrapping paper 25 and 5 bouquets in stock. For the 1000 attempt the dialog marks each short material "Missing" with the shortfall and
the Produce Product button is disabled, so nothing is sent and nothing changes.

## Scene 6 — A sale (proves FR-101, FR-103, FR-104, FR-105, FR-107, FR-108, FR-112)
Make a sale of 2 bouquets by card.
**Show:** the unit price filled from the product, the sale number `SALE-YYYYMMDD-0001`, status Completed, the revenue, cost and
gross profit, and the bouquet stock down to 3. Try to sell 10: the page shows "The requested quantity exceeds the available
Product stock." and the Complete Sale button is disabled.

## Scene 7 — A return and a cancellation (proves FR-114, FR-119, FR-121, FR-122, FR-123, FR-124)
Return 1 bouquet from that sale, then make a second sale of 1 bouquet and cancel it.
**Show:** the return document `RET-YYYYMMDD-0001`, the refund at the price charged, the status Partially Returned, the stock
going back up, and the second sale ending Cancelled with its stock restored.

## Scene 8 — Dashboard and stock history (proves FR-37, FR-38, FR-39, FR-127, FR-128, FR-133)
Open the dashboard (Overview in the menu), then Stock History. Set Inventory to Products, type `rose` in Item and press Apply.
**Show:** the summary counts (the Sales card counts Completed and Partially Returned sales, not Cancelled ones); the bouquet's
movements from the demo, in order, with totals that cover the whole filtered result.

## Scene 9 — Monthly report and CSV (proves FR-136, FR-137, FR-140, FR-142, FR-145)
Open Reports, then Monthly Sales, for the current month and press Export CSV.
**Show:** gross revenue, refunds and net revenue for the month, the three payment methods, and the downloaded
`monthly-sales-YYYY-MM.csv` opening cleanly in a spreadsheet.

## Scene 10 — Security (negative case; proves FR-4, FR-14, FR-28, NFR-7)
Run this scene last, in place of the final sign-out in Scene 1: it changes the demo administrator's password, so note the new
one for the next run.
1. Sign out, then type `/dashboard` in the address bar: the sign-in page appears, not the data.
2. Sign in in two browsers. In the first, change the password. In the second, press any menu item.
**Show:** the second browser is sent back to the sign-in page, because a password change ends every session of that user.

## What the demo does not show

Say this out loud at the end, so the audience knows the limits (they are in the risk register): there is no login throttling
or lockout (decision OQ-6), the server is not bound to the local machine by its configuration (risk R-09), the app keeps its data in one local file with no backup of its own (OQ-10), there is one
administrator role, and the supported browsers and accessibility target are not decided (OQ-8, OQ-15).
