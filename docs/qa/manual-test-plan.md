# Manual test plan — Flower Shop Inventory

A test plan that a person who is not a developer can follow in a browser. It covers the shipped behaviour in
`docs/requirements.md`; each case names the requirements it checks. **Nothing here has been executed yet:** every result box
is empty, and a case counts as passed only when someone has ticked it and signed the run record at the end.

This plan is the manual half of the evidence. The automated half is the test suite that `node scripts/dod.mjs` runs;
`docs/qa/traceability-report.md` (generated) maps each requirement to the tests that carry its `@trace` tag. The
requirements that have no automated test are listed in `docs/qa/waivers/`; the cases marked **Manual only** below are the
ones that stand in for them.

## Before you start

- **Use a copy of the data, never the real shop database.** The cases create, change and delete records. Stop the app,
  copy `flower-shop-local.db` somewhere safe, and run the plan against a new empty database (move the original away so the
  app creates a new one, then restore it afterwards). The case list assumes an empty database.
- **Start the app:** `Start OnlineStore.cmd`, or `mvn "-Dskip.frontend=true" spring-boot:run` plus `pnpm start` in `frontend/`
  (README). Open `http://localhost:8081` (or `http://localhost:4200` for the development server).
- **Sign-in:** the only user is the administrator. Its name is `admin` unless `APP_ADMIN_INITIAL_USERNAME` says otherwise,
  and its password is the value given to `APP_ADMIN_INITIAL_PASSWORD` when the empty database was first started. Do not write
  that password in this file or in the run record.
- **Browser:** the supported browsers are not declared yet (OQ-8). Record the browser and version you used.
- **Order:** run the sections in order. Later sections reuse the records the earlier ones create.

Reference data used by the cases (create it in section 3 and 4):

| Raw material | Unit | Opening quantity | Opening unit cost | Reorder level |
|---|---|---|---|---|
| Rose | BUNCH | 20 | 50.00 | 5 |
| Ribbon | METER | 10 | 8.00 | 0 |
| Wrapping paper | PIECE | 30 | 3.00 | 0 |

Product: SKU `BQ-001`, name `Rose bouquet`, recipe 1 Rose + 2 Ribbon + 1 Wrapping paper per unit, markup 30, advertising
cost 0, opening quantity 0.

## 1. Sign-in and password

### MT-01 Sign in and sign out
**Covers:** FR-1, FR-3, FR-8, FR-9, FR-20, FR-21
**Steps:** 1. Open the app; you land on the sign-in page with the username filled in as `admin`. 2. Enter a wrong password and
press Sign in. 3. Enter the right password and press Sign in. 4. Use Sign out in the menu.
**Expected:** Step 2 shows "Invalid username or password" and stays on the sign-in page. Step 3 opens the dashboard. Step 4
returns to the sign-in page.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-02 The password reveal toggle
**Covers:** FR-22
**Steps:** 1. On the sign-in page type something into the password field. 2. Press the reveal control. 3. Wait 5 seconds.
**Expected:** The text becomes visible in step 2 and is hidden again by itself after about 5 seconds.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-03 Change the password
**Covers:** FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, NFR-1
**Steps:** Open Change Password. Try, one at a time: a wrong current password; a new password of 9 characters; a confirmation
that differs; a new password equal to the current one. Then change it correctly to a new password of at least 10
characters. Sign in with the new password.
**Expected:** Each wrong attempt keeps you signed in and shows its own message. The page checks two of them itself before
sending anything: a short new password shows "The password must be between 10 and 64 characters." and a different confirmation
shows "The passwords do not match." The other two come from the server: "Current password is incorrect" and "New password must
be different from current password". The correct change ends the session, shows "Password changed successfully. Sign in with
your new password.", and only the new password works afterwards.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-04 A password change ends other sessions
**Covers:** FR-14, NFR-7
**Steps:** 1. Sign in in two different browsers (or one normal and one private window). 2. Change the password in the first.
3. In the second, press any menu item that loads data.
**Expected:** The second browser is sent back to the sign-in page.
**Result:** ☐ Pass ☐ Fail — notes: ______

## 2. Session and access

### MT-05 Protected pages need a sign-in
**Covers:** FR-4, FR-28, FR-33, FR-34
**Steps:** 1. Signed out, type `/dashboard`, `/sales` and `/raw-materials` into the address bar one at a time. 2. Sign in and
reload each of those pages, plus `/stock-movements`, `/products` and `/change-password`.
**Expected:** Step 1 shows the sign-in page each time. Step 2 reloads each page without a "not found" error.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-06 A signed-out tab clears the others
**Covers:** FR-31
**Steps:** 1. Sign in and open the app in two tabs. 2. Sign out in the first tab. 3. Switch to the second tab and use the menu.
**Expected:** The second tab ends up on the sign-in page and shows no protected data.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-07 Session expiry (**Manual only**)
**Covers:** FR-23, FR-24, FR-26, NFR-3
**Steps:** The real timeout is 8 hours of inactivity, so this case is run once, with patience: sign in, leave the page untouched
for more than 8 hours (or ask a developer to run the app with a shortened `server.servlet.session.timeout` for this run and
note it in the record), then press a menu item.
**Expected:** You are sent to the sign-in page, which says "Your session has ended. Please sign in again." (FR-26).
**Result:** ☐ Pass ☐ Fail ☐ Not run — notes: ______

### MT-08 Health check
**Covers:** FR-36
**Steps:** Signed out, open `http://localhost:8081/api/health`.
**Expected:** The page shows `{"status":"UP"}` and you are not asked to sign in.
**Result:** ☐ Pass ☐ Fail — notes: ______

## 3. Raw materials

### MT-09 Create the three raw materials
**Covers:** FR-42, FR-44, FR-45, FR-46, FR-47, FR-48, FR-57
**Steps:** In Raw Materials add Rose, Ribbon and Wrapping paper with the values in the reference table. Look at the list.
**Expected:** The list shows the three, ordered by name, with quantity, unit cost and a stock value of quantity times unit
cost (Rose 1,000.00; Ribbon 80.00; Wrapping paper 90.00). Stock History (section 9) will show an opening balance for each.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-10 Raw material input rules
**Covers:** FR-42, FR-43, FR-44, FR-56
**Steps:** Try to add: a raw material with no name; a name of 121 characters; an initial quantity above zero with no unit cost;
a second raw material named `Rose`.
**Expected:** The first three are refused with a message that names the problem. The fourth is accepted, because names do not
have to be unique (decision OQ-3 is still open; see the risk register).
**Result:** ☐ Pass ☐ Fail — notes: ______
**Then:** delete the duplicate `Rose` (accept the confirmation) before going on, so the later cases find only one Rose.

### MT-11 Receipt, write-off and adjustment
**Covers:** FR-61, FR-62, FR-63, FR-64, FR-65, FR-66, FR-67, FR-69
**Steps:** 1. Record a receipt of 10 Rose bunches at 60.00. 2. Write off 2 Ribbon metres with the reason "cut too short".
3. Try to write off 500 Ribbon. 4. Adjust Wrapping paper to 28, then try to adjust it to 28 again.
**Expected:** Rose is now 30 at an average cost of 53.3333 (shown rounded as the page shows it): (20 × 50 + 10 × 60) / 30.
Ribbon is 8. For the 500 write-off the page shows "The write-off quantity exceeds available stock." and sends nothing, so
the quantity stays 8 (the server's own "Insufficient raw material stock" is the safety net behind it). Wrapping paper becomes 28,
and for the second adjustment to 28 the page shows "The counted quantity already matches the recorded stock." and disables Save Adjustment,
so nothing is sent (the server's "Actual stock already matches the recorded raw material stock" is the safety net behind it).
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-12 Reorder level and the low-stock badge
**Covers:** FR-39, FR-58, FR-59, FR-60
**Steps:** Edit Rose and set the reorder level to 40. Look at the list and the dashboard. Set it back to 5.
**Expected:** Rose shows a "Low stock" badge and the dashboard's low-stock count rises by one while its quantity (30) is at or
below 40. After setting 5 the badge and the extra count disappear. Quantity and stock value did not change.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-13 Edit rules and deleting a raw material
**Covers:** FR-49, FR-50, FR-54, FR-55
**Steps:** 1. Edit Rose and try to change its unit. 2. Add a raw material `Test stem` with no stock and delete it, first
answering "Cancel" to the confirmation and then accepting.
**Expected:** Step 1: the unit cannot be changed while Rose has stock. Step 2: Cancel keeps the record, accepting removes it.
(Deleting a raw material that a product recipe uses is checked in MT-15, once the product exists.)
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-14 Pictures
**Covers:** FR-70, FR-71, FR-74, FR-75
**Steps:** On a raw material, upload a small PNG, then try a `.gif`, then a JPG larger than 2 MB, then save the record again
without choosing a file.
**Expected:** The PNG is accepted and shown. The GIF is refused with "Select a JPG, JPEG, or PNG file." The large file is
refused with "The image size cannot exceed 2 MB." Saving again keeps the picture. There is no way to remove a picture once set (OQ-11).
**Result:** ☐ Pass ☐ Fail — notes: ______

## 4. Products and production

### MT-15 Create the product and see its price
**Covers:** FR-76, FR-79, FR-81, FR-82, FR-84, FR-52
**Steps:** 1. In Products add the product from the reference data. Watch the preview while you fill the recipe and the markup.
2. Go to Raw Materials and try to delete Rose.
**Expected:** Step 1: the preview shows the recipe unit cost 72.3333 (Rose 53.3333 + 2 × Ribbon 8.00 + Wrapping paper 3.00) and a
selling price of 94.03, which is (recipe cost + advertising cost) × (1 + markup / 100) = 72.3333 × 1.3 rounded to cents, with
no way to type the price; after saving, the list shows the same price. Step 2: the delete is
refused with a message that names the product recipe that uses Rose.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-16 Product input rules
**Covers:** FR-77, FR-78, FR-79
**Steps:** Try: a second product with SKU `bq-001`; a markup of 12.345; a product with an empty recipe; a recipe item with
quantity 0.
**Expected:** Nothing is saved, and each attempt shows its own message. The markup shows "Enter a markup percentage between 0 and
999999.99, with at most two decimals." The empty recipe shows "Add at least one raw material to the recipe." The recipe item with
quantity 0 shows "Select a material and enter a quantity greater than zero." The duplicate SKU is sent to the server and comes
back in a red alert that names the SKU, "A product with SKU “…” already exists." (SKUs are unique regardless of letter case).
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-17 Produce a batch
**Covers:** FR-88, FR-89, FR-90, FR-91, FR-92, FR-94
**Steps:** 1. In Raw Materials record a receipt of 20 Ribbon at 8.00 (Ribbon is now 28). 2. Produce 5 `Rose bouquet`.
3. Look at Raw Materials. 4. Try to produce 1000.
**Expected:** Step 2 succeeds and the dialog's production cost is the cost recorded. Rose is 25, Ribbon 18 and Wrapping paper
23, and the product quantity is 5. In step 4 the dialog's table shows "Missing" with the shortfall against each raw material that is short, the Produce button is
disabled, nothing is sent, and no quantity changes (the server's refusal of a short batch, FR-89, is the safety net behind it).
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-18 Product write-off and adjustment
**Covers:** FR-95, FR-96, FR-97, FR-98, FR-99, FR-100
**Steps:** (The product has 5 bouquets after MT-17.) 1. Write off 1 bouquet with a reason (stock becomes 4). 2. Try to write off
50. 3. Try a write-off of 1.5. 4. Adjust the quantity to 5, as if a recount found one more. 5. Adjust it to 5 again.
**Expected:** Steps 1 and 4 succeed and leave the stock at 4 and then 5, and both show up in Stock History. In step 2 the page
shows "The write-off quantity exceeds available Product stock." and sends nothing; in step 3 it shows "Enter a positive whole
number." and sends nothing (the server's "Insufficient product stock" and "must be a whole number" are the safety net behind
them); in step 5 the page shows "The counted quantity already matches the recorded Product stock." and disables Save Adjustment,
so nothing is sent (the server's "Actual stock already matches…" is the safety net). The stock is 5 when you finish.
**Result:** ☐ Pass ☐ Fail — notes: ______

## 5. Sales

### MT-19 Make a sale
**Covers:** FR-101, FR-102, FR-103, FR-104, FR-105, FR-106, FR-107, FR-108, FR-112
**Steps:** In Sales add a sale of 2 bouquets, payment CARD, today's date. Note the unit price the form fills in.
**Expected:** The unit price is filled from the product's selling price, 94.03. The sale gets a number like
`SALE-YYYYMMDD-0001`, status Completed, with revenue 188.06 and a cost and gross profit. Product stock falls from 5 to 3. If you
enter a quantity above the stock (try 10), the page shows "The requested quantity exceeds the available Product stock.", the
Complete Sale button is disabled, and nothing is sent (the server's "Insufficient product stock" is the safety net behind it).
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-20 A sale cannot be edited
**Covers:** FR-110
**Steps:** Open the sale you made and look for any way to edit or delete it.
**Expected:** There is none: only return and cancel are offered.
**Result:** ☐ Pass ☐ Fail — notes: ______

## 6. Returns and cancellations

### MT-21 Partial and full return
**Covers:** FR-114, FR-115, FR-116, FR-118, FR-119, FR-122, FR-123, FR-126
**Steps:** 1. On the 2-bouquet sale return 1 unit with a reason. 2. Try to return 2 more. 3. Return the last unit.
**Expected:** After step 1 the sale is Partially returned, a document `RET-YYYYMMDD-0001` exists, the refund is one unit at the
price actually charged, and product stock is back up from 3 to 4. In step 2 the page shows "Exceeds available quantity." under
the line and does not accept it (the server's "exceeds the remaining…" is the safety net). After step 3
the sale is Returned, product stock is 5, and no more returns are offered.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-22 Cancel a sale
**Covers:** FR-124, FR-125, FR-117
**Steps:** Make a new sale of 1 bouquet. Try to cancel it with a date before the sale date. Cancel it with today's date.
Then try to cancel a sale that has had a return.
**Expected:** The early date is not accepted (the date field has the sale date as its lower limit, but the form does not rely on
the browser, so the refusal may be the browser's flag or the server's message; write down which). The new sale takes stock from 5 to 4; the cancellation restores it to 5 and marks the sale Cancelled. The
sale from MT-21 (it has returns) has no Cancel Sale button at all, because the page offers it only for a Completed sale (the
server's "Only a completed sale without previous returns can be cancelled" is the safety net).
**Result:** ☐ Pass ☐ Fail — notes: ______

## 7. Dashboard

### MT-23 Dashboard figures
**Covers:** FR-37, FR-38, FR-39, FR-40
**Steps:** Open the dashboard after sections 3 to 6. Compare it with the lists.
**Expected:** Raw material types and product types match the list lengths; product units match the sum of product
quantities; the Sales card counts Completed and Partially returned sales only (not Cancelled or Returned); the Low Stock
card counts raw materials at or below a reorder level above zero.
**Result:** ☐ Pass ☐ Fail — notes: ______

## 8. Monthly report

### MT-24 Monthly sales report
**Covers:** FR-136, FR-137, FR-138, FR-140, FR-142, FR-144
**Steps:** Open the Monthly Sales report for the current month. Pick another month, then clear the picker.
**Expected:** Revenue equals gross sales minus refunds for the month; returns and cancellations count in the month of their own
date; payment methods always list CASH, CARD and BANK_TRANSFER (zero where unused). Another month reloads; clearing the
picker changes nothing.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-25 CSV export
**Covers:** FR-145
**Steps:** Press Export CSV for the current month and open the file in a spreadsheet and in a text editor.
**Expected:** The file is named `monthly-sales-YYYY-MM.csv`, opens with the correct characters (UTF-8 with a byte order
mark), and every cell is quoted.
**Result:** ☐ Pass ☐ Fail — notes: ______

## 9. Stock history

### MT-26 Filters, search and paging
**Covers:** FR-127, FR-128, FR-129, FR-130, FR-131, FR-132, FR-133, FR-135
**Steps:** Open Stock History. Filter by Raw material, then Product; search `rose` and then a Ukrainian name if you have one;
set From later than To; page through the list.
**Expected:** Newest movements first; filters narrow the list; the search matches names and SKUs in any alphabet; a From date
after To shows "From date cannot be later than To date"; the totals at the top cover the whole filtered result, not only the
visible page.
**Result:** ☐ Pass ☐ Fail — notes: ______

## 10. Screens and devices (**Manual only**)

These stand in for requirements that have no automated mechanism here: NFR-17 (supported browsers), NFR-18 (responsive layout
and visual fidelity) and NFR-20 (accessibility). Their waivers are in `docs/qa/waivers/`; a passing run does not close a waiver.
Only the owner can, once the evidence is accepted.

### MT-27 Phone and tablet layout
**Covers:** NFR-18, FR-35
**Steps:** In a browser's device mode (or on a real phone) set the width to 375 px, then 768 px. Open every page, and the
menu.
**Expected:** No page needs sideways scrolling to read; the menu opens from its toggle and closes when a link is chosen; forms
stay usable.
**Result:** ☐ Pass ☐ Fail — notes: ______

### MT-28 Keyboard and screen reader basics
**Covers:** NFR-20
**Steps:** On the sign-in page and on one form, use only Tab, Shift+Tab, Enter and Space. Turn on a screen reader if you have
one.
**Expected:** Every control can be reached and used from the keyboard in a sensible order, with a visible focus mark; form
fields are announced with their labels.
**Result:** ☐ Pass ☐ Fail — notes: ______

## Run record

| Field | Value |
|---|---|
| Date of run | |
| Tester | |
| Application version (commit shown by `git log -1 --format=%h`) | |
| Browser and version | |
| Database used (new empty / copy) | |
| Cases passed / failed / not run | |
| Defects found (reference) | |
| Signature | |
