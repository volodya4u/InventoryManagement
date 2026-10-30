# Risk register — Flower Shop Inventory

Known risks of running and releasing the application, what already limits each one, and what is still open. Every row cites its
source in the repository. Likelihood and impact (L, M, H) are the author's first assessment for a single-owner, local-use
shop; the owner should change any rating that does not match how the shop is run. A risk marked **Decision** needs an answer
from the owner, not work from an engineer.

Questions with an `OQ-` number are in `docs/requirements.md` › Open questions. At baseline sign-off the owner accepted the
recommended default for them (BC-4), but their rows still read `open` until each is answered one by one, so this register
treats each as "accepted as is, not yet formally decided".

## Product and data risks

| ID | Risk | Source | L | I | What limits it today | Open action |
|---|---|---|---|---|---|---|
| R-01 | The database file `flower-shop-local.db` lives in the project root (`application-local.yml`), and this project sits inside a OneDrive folder. A sync client that copies or locks a live SQLite file can leave a conflicted or damaged copy. This is a risk to confirm, not an observed failure. | README "Local Profile" (the Database bullet), `src/main/resources/application-local.yml` | M | H | The database is excluded from git (`*.db`). | **Decision:** keep the file outside the synced folder, or exclude it from sync, and test a restore from a copy. |
| R-02 | The application has no backup, restore or export of its data. Losing the file loses the stock, sales and history. | OQ-10, NFR-16 | M | H | The recommended default is that the owner copies the file; the app only exposes a health check. | **Decision:** state a backup routine (how often, where) and write it into the README. |
| R-03 | Deleting an unsold product or an unused raw material also deletes its movement history. | OQ-5, FR-54 | L | M | Deletes ask for confirmation (FR-55, FR-86); items used in a recipe, a batch or a sale cannot be deleted (FR-52, FR-53, FR-85). | **Decision:** accept, or ask for a "keep history" rule as a new slice. |
| R-04 | A stored selling price does not follow later cost changes until the product is saved again. | OQ-1 (answered: intended), FR-81 | L | L | The owner confirmed this is the design (PR #80). | None; listed so a new user is told. |
| R-05 | A return re-blends the product's average cost, so the average can drift after returns. | OQ-16, FR-121 | L | M | The rule is pinned by tests; the README describes the intent. | **Decision:** confirm that behaviour and the README wording together. |
| R-06 | Any date can be entered, past or future, for sales, receipts, write-offs and returns (only "return not before the sale" is checked), so monthly reports can be moved by mistake. | OQ-4 | M | M | Reports read by the recorded dates; history shows every movement. | **Decision:** accept, or ask for a date rule. |
| R-07 | Raw material names need not be unique, so two items can look the same in lists. | OQ-3, FR-56 | M | L | Products have a unique SKU. | **Decision:** accept, or ask for a uniqueness rule. |
| R-08 | Small behaviours the owner may not expect: pictures cannot be removed once set (OQ-11), products are counted in whole units while raw materials allow decimals (OQ-12), and amounts are shown in UAH without a stored currency (OQ-14, NFR-22). | OQ-11, OQ-12, OQ-14 | L | L | Each is pinned by a test or described in the requirements. | **Decision:** confirm or change each. |

## Security risks

| ID | Risk | Source | L | I | What limits it today | Open action |
|---|---|---|---|---|---|---|
| R-09 | Nothing slows down password guessing: there is no login throttling or lockout. | OQ-6, NFR-10 | L | M | "Local only" (BC-5) is now enforced by the configuration, not only assumed: in profile `local` the server listens on `127.0.0.1` only (NFR-23, 2026-10-30), so another device on the network cannot reach the sign-in page; before that, no `server.address` was set and it listened on every network interface, with the machine's firewall as the only limit. Passwords are bcrypt hashes at cost 12 (NFR-2); a changed password must be 10 to 64 characters (NFR-1; the bootstrap password is not checked, OQ-7). | **Decision:** accepted while the app stays on one machine; the bind can be overridden on purpose (`SERVER_ADDRESS`), so revisit throttling before any remote use. |
| R-10 | The app is served over plain HTTP and the session cookie has no `Secure` flag. This is wrong if the app is ever opened from another machine. | OQ-13, NFR-4, NFR-23 | L | H | The server listens on 127.0.0.1 only (NFR-23), so it is not reachable from another machine unless someone overrides that on purpose. The cookie is `HttpOnly` and `SameSite=Strict` (NFR-4); CSRF tokens protect writes (NFR-5, FR-6); a Content-Security-Policy is sent (NFR-6). | **Decision:** record that remote use needs HTTPS first. |
| R-11 | One administrator role, one shared account, unlimited concurrent sessions. There is no audit of who did what. | NFR-11 | L | M | A password change ends every session of the user (FR-14, NFR-7). | None for single-owner use; revisit before adding staff. |

## Quality and evidence risks

| ID | Risk | Source | L | I | What limits it today | Open action |
|---|---|---|---|---|---|---|
| R-12 | No performance budget exists, and the raw material, product and sales lists load everything at once, so the screens may slow down as the shop's data grows. | OQ-9, NFR-15, waiver `2026-10-11-baseline-NFR-15.md` | L | M | Stock History is paged (FR-131). | **Decision:** give a budget (the recommended default is in OQ-9), then a test can assert it. |
| R-13 | Supported browsers, the responsive layout and accessibility are checked by tools that find only part of the problems: axe finds rule violations and not everything a screen-reader user meets, and the layout check is a model's judgement of screenshots at 375, 768 and 1280 px, which is not deterministic. | OQ-8, OQ-15, NFR-17, NFR-18, NFR-20, ADR-0011 | L | M | The suite runs in Chromium, Firefox and WebKit; axe runs over every page in both colour schemes and fails on serious or critical violations (`docs/qa/a11y-report.json`); 24 screenshots judged (`docs/qa/vision-report.json`); MT-27 and MT-28 stay as manual cases. The application has no dark theme, so the dark scheme is an emulated preference. | Run MT-27 and MT-28 on a real phone and with a screen reader; decide whether a dark theme is wanted. |
| R-14 | The 16 baseline capabilities were documented from existing code, so their evidence is "retrofitted, not earned red-first". A test written after the code can pass for the wrong reason. | `.project-factory/retrofit.json`, `node scripts/gate-status.mjs` | M | M | Six hardening slices (H1 to H6) added tests for the behaviour no test asserted. | None; keep stating it in every acceptance report. |

## Delivery and process risks

| ID | Risk | Source | L | I | What limits it today | Open action |
|---|---|---|---|---|---|---|
| R-15 | The release gate G7 may still be red for reasons other than recordings: changes not yet archived, and the acceptance and manual-run evidence no script can give. (Recordings: ADR-0010, `docs/qa/demo-recordings/`. The two trajectory gaps in `docs/qa/historical-gaps.md` are waived under ADR-0009.) | `node scripts/gate-status.mjs`, `docs/qa/recording-exemptions.json` | M | M | Each reason is printed by the gate; the exemption list is checked by `check-traceability.mjs`. | **Decision:** archive the merged changes; run the manual plan and sign the acceptance report. |
| R-16 | The process retro of 2026-10-28 filed findings PD-4, PD-6, PD-7 and PD-8 that are not yet addressed: the recordings demand shows only at release (PD-4), G1 and G3 still read "needs sign-off" while later gates pass (PD-6), only `gate-status` writes to the telemetry ledger (PD-7), and waiver approvals are typed by the agent and cannot be told from the owner's (PD-8). | The owner's local `docs/qa/process-defects.json` (not committed, ADR-0008) | M | M | PD-1, PD-2, PD-3 and PD-9 are fixed and archived; PD-5 is fixed in the pull request that adds ADR-0009. | **Decision:** approve or reject each remaining finding. |
| R-17 | Signed human approval of pull requests is not set up: `quality/allowed-signers` lists no hardware-backed key, so the `pr-evidence` gate reports it as not applicable and the merge relies on the owner reading each pull request. | `node scripts/pr-evidence.mjs` output, ADR-0005 | L | M | The owner merges every pull request by hand; the reviewer and the evidence gates run first. | **Decision:** enrol a hardware key if the extra step is wanted. |
