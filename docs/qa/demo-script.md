# Demo script — Flower Shop Inventory

A walkthrough that shows the shop's whole stock-and-sales cycle in about fifteen minutes, one scene per capability and one
security scene. It is written to be performed live by a person. **No recording of it exists yet:** recordings need a browser
automation tool that this repository does not have (the Playwright decision is open, see the acceptance report). If one is
added later, each scene below is the script for one clip, and the sentence under "Show" is what the clip must make visible.

## Setup

- Start from a new empty database (`flower-shop-local.db` moved aside) so the numbers below come out the same every time.
  Restore the real database afterwards.
- Start the app (`Start OnlineStore.cmd`) and open `http://localhost:8081`. The administrator's password is the value given
  to `APP_ADMIN_INITIAL_PASSWORD` for the new database. Keep it out of the recording and out of any file.
- Use a desktop browser at a normal width, with the language set to English.

## Scene 1 — Sign in (proves FR-1, FR-3, FR-20, FR-21, FR-9)
Open the app. Sign in with a wrong password, then the right one. At the end of the demo, sign out.
**Show:** the message "Invalid username or password" for the wrong attempt; the dashboard after the right one.

## Scene 2 — Raw materials and stock value (proves FR-42, FR-45, FR-46, FR-47, FR-48)
Add Rose (bunch, 20 at 50.00, reorder level 5), Ribbon (metre, 10 at 8.00) and Wrapping paper (piece, 30 at 3.00).
**Show:** the list ordered by name, each row's stock value (1,000.00 / 80.00 / 90.00) and the total.

## Scene 3 — Receipts and the average cost (proves FR-61, FR-62, FR-63, FR-69)
Record a receipt of 10 Rose bunches at 60.00, then 20 Ribbon metres at 8.00.
**Show:** Rose now has 30 bunches at an average cost of 53.3333, which is (20 × 50 + 10 × 60) / 30; the receipt total on the
page.

## Scene 4 — A product whose price is calculated (proves FR-76, FR-79, FR-81, FR-82)
Create the product `BQ-001` "Rose bouquet": 1 Rose, 2 Ribbon and 1 Wrapping paper per unit, markup 30, advertising cost 0,
opening quantity 0.
**Show:** the live preview of the recipe cost and the selling price while the form is filled in. Point out that there is no
field to type a price: it is always cost plus markup, and it stays as saved if a material's cost changes later (decision OQ-1).

## Scene 5 — Production (proves FR-88, FR-89, FR-90, FR-92, FR-94)
Open the production dialog for the bouquet and produce 5. Then try to produce 1000.
**Show:** the dialog counting the materials needed and the cost before posting; after posting, Rose 25, Ribbon 20, Wrapping
paper 25 and 5 bouquets in stock. The 1000 attempt is refused and names the short materials, and nothing changes.

## Scene 6 — A sale (proves FR-101, FR-103, FR-104, FR-105, FR-107, FR-108, FR-112)
Make a sale of 2 bouquets by card.
**Show:** the unit price filled from the product, the sale number `SALE-YYYYMMDD-0001`, status Completed, the revenue, cost and
gross profit, and the bouquet stock down to 3. Try to sell 10 and show the refusal.

## Scene 7 — A return and a cancellation (proves FR-114, FR-119, FR-121, FR-122, FR-123, FR-124)
Return 1 bouquet from that sale, then make a second sale of 1 bouquet and cancel it.
**Show:** the return document `RET-YYYYMMDD-0001`, the refund at the price charged, the status Partially returned, the stock
going back up, and the second sale ending Cancelled with its stock restored.

## Scene 8 — Dashboard and stock history (proves FR-37, FR-38, FR-39, FR-127, FR-128, FR-133)
Open the dashboard, then Stock History. Filter by Product, then search `rose`.
**Show:** the summary counts (the Sales card counts Completed and Partially returned sales, not Cancelled ones); every movement
the demo created, in order, with totals that cover the whole filtered result.

## Scene 9 — Monthly report and CSV (proves FR-136, FR-137, FR-140, FR-142, FR-145)
Open the Monthly Sales report for the current month and press Export CSV.
**Show:** gross revenue, refunds and net revenue for the month, the three payment methods, and the downloaded
`monthly-sales-YYYY-MM.csv` opening cleanly in a spreadsheet.

## Scene 10 — Security (negative case; proves FR-4, FR-14, FR-28, NFR-7)
1. Sign out, then type `/dashboard` in the address bar: the sign-in page appears, not the data.
2. Sign in in two browsers. In the first, change the password. In the second, press any menu item.
**Show:** the second browser is sent back to the sign-in page, because a password change ends every session of that user.

## What the demo does not show

Say this out loud at the end, so the audience knows the limits (they are in the risk register): there is no login throttling
or lockout (decision OQ-6), the app keeps its data in one local file with no backup of its own (OQ-10), there is one
administrator role, and the supported browsers and accessibility target are not decided (OQ-8, OQ-15).
