// Tests for scripts/check-a11y.mjs: an accessibility report is only evidence when it covers every route in both colour
// schemes, was made from the current frontend source, and holds no serious or critical violation.
// Run: node --test scripts/check-a11y.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport, expectedRoutes, requiredTags, validateReport } from "./check-a11y.mjs";

const routesSource = `
export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: 'dashboard', loadComponent: () => import('./dashboard') },
      { path: 'reports/monthly-sales', loadComponent: () => import('./reports') },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];`;

const page = (route, scheme, extra = {}) => ({
  route,
  scheme,
  authenticated: route !== "login",
  passes: 30,
  incomplete: 1,
  violations: [],
  ...extra,
});
const fullPages = () => ["login", "dashboard", "reports/monthly-sales"].flatMap((route) => [page(route, "light"), page(route, "dark")]);
const meta = { sourceHash: "abc", browser: "chromium", axeVersion: "4.11.0" };
const routes = ["login", "dashboard", "reports/monthly-sales"];

test("the routes to check are the paths in the router, without the redirects", () => {
  assert.deepEqual(expectedRoutes(routesSource), ["login", "dashboard", "reports/monthly-sales"]);
});

test("a report that covers every route in both schemes with no violation passes", () => {
  const report = buildReport(fullPages(), meta);
  assert.equal(report.status, "passed");
  assert.deepEqual(validateReport(report, { routes, sourceHash: "abc" }), []);
});

test("a serious or critical violation makes the report fail and names the page", () => {
  const pages = fullPages();
  pages[2] = page("dashboard", "light", { violations: [{ id: "color-contrast", impact: "serious", help: "x", nodes: 3 }] });
  const report = buildReport(pages, meta);
  assert.equal(report.status, "failed");
  const problems = validateReport(report, { routes, sourceHash: "abc" });
  assert.ok(problems.some((p) => /dashboard/.test(p) && /color-contrast/.test(p) && /serious/.test(p)), problems.join("\n"));
});

test("a minor or moderate violation is listed but does not fail the report", () => {
  const pages = fullPages();
  pages[0] = page("login", "light", { violations: [{ id: "region", impact: "moderate", help: "x", nodes: 1 }] });
  const report = buildReport(pages, meta);
  assert.equal(report.status, "passed");
  assert.deepEqual(validateReport(report, { routes, sourceHash: "abc" }), []);
});

test("a report that says passed while a page holds a serious violation is refused", () => {
  const pages = fullPages();
  pages[2] = page("dashboard", "light", { violations: [{ id: "label", impact: "critical", help: "x", nodes: 1 }] });
  const report = { ...buildReport(pages, meta), status: "passed" };
  assert.ok(validateReport(report, { routes, sourceHash: "abc" }).some((p) => /status/.test(p)));
});

test("a route or a scheme that was not checked is a problem", () => {
  const pages = fullPages().filter((p) => !(p.route === "reports/monthly-sales" && p.scheme === "dark"));
  const problems = validateReport(buildReport(pages, meta), { routes, sourceHash: "abc" });
  assert.ok(problems.some((p) => /reports\/monthly-sales/.test(p) && /dark/.test(p)), problems.join("\n"));
});

test("a route the router has but the report lacks is a problem", () => {
  const problems = validateReport(buildReport(fullPages(), meta), { routes: [...routes, "sales"], sourceHash: "abc" });
  assert.ok(problems.some((p) => /sales/.test(p)));
});

test("a page where axe ran no rule proves nothing", () => {
  const pages = fullPages();
  pages[1] = page("login", "dark", { passes: 0 });
  const problems = validateReport(buildReport(pages, meta), { routes, sourceHash: "abc" });
  assert.ok(problems.some((p) => /login/.test(p) && /no rule/.test(p)), problems.join("\n"));
});

test("a page behind the sign-in that was checked signed out proves nothing", () => {
  const pages = fullPages();
  pages[2] = page("dashboard", "light", { authenticated: false });
  const problems = validateReport(buildReport(pages, meta), { routes, sourceHash: "abc" });
  assert.ok(problems.some((p) => /dashboard/.test(p) && /signed in/.test(p)), problems.join("\n"));
});

test("a report made from other frontend source is stale", () => {
  const problems = validateReport(buildReport(fullPages(), meta), { routes, sourceHash: "def" });
  assert.ok(problems.some((p) => /stale/.test(p)));
});

test("the report names the standard and its tags, and says the dark scheme is an emulated preference", () => {
  const report = buildReport(fullPages(), meta);
  assert.equal(report.standard, "WCAG 2.1 AA");
  assert.deepEqual(report.tags, requiredTags);
  assert.deepEqual(requiredTags, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  assert.match(report.note, /prefers-color-scheme/);
});

test("a report with other tags than WCAG 2.1 A and AA is refused", () => {
  const report = { ...buildReport(fullPages(), meta), tags: ["wcag2a"] };
  assert.ok(validateReport(report, { routes, sourceHash: "abc" }).some((p) => /tags/.test(p)));
});
