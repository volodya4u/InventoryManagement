#!/usr/bin/env node
// Accessibility gate (NFR-20, ADR-0011). Runs axe-core through Playwright over every route of the application, signed in,
// in the light and the dark colour scheme, with the WCAG 2.1 A and AA rule sets, and writes docs/qa/a11y-report.json.
// A serious or critical violation fails it; minor and moderate ones are listed in the report and do not.
//
//   node scripts/check-a11y.mjs            run the browser check (needs the built JAR and Chromium) and write the report
//   node scripts/check-a11y.mjs --check    verify the committed report without a browser: every route in both schemes,
//                                          no serious or critical violation, made from the current frontend source
//
// The routes are read from frontend/src/app/app.routes.ts, so a route added later has to be covered or the check fails.
// The application declares `color-scheme: light` and has no dark theme (OQ-15 asked for both schemes), so the dark pass
// emulates `prefers-color-scheme: dark` and shows what a visitor with that preference gets: the light theme, checked again.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
export const schemes = ["light", "dark"];
const failingImpacts = new Set(["serious", "critical"]);
const reportPath = "docs/qa/a11y-report.json";
const routesPath = "frontend/src/app/app.routes.ts";
const note =
  "The application has no dark theme (frontend/src/styles.scss sets color-scheme: light), so the dark pass emulates " +
  "prefers-color-scheme: dark and shows what a visitor with that preference gets. Automated rules find only part of the " +
  "accessibility problems; this report does not replace a manual check with a screen reader. The pages are checked with rows in every sale state and a "+
  "material below its reorder level; dialogs and error messages are not part of what is checked.";

// The router's paths, without the redirects and the wildcard: the pages a person can open.
export function expectedRoutes(routesSource) {
  const paths = [];
  for (const line of routesSource.split(/\r?\n/)) {
    const path = /\bpath:\s*'([^']*)'/.exec(line)?.[1];
    if (!path || path === "**" || /redirectTo/.test(line)) continue;
    paths.push(path);
  }
  return paths;
}

// pages: [{ route, scheme, authenticated, passes, incomplete, violations: [{ id, impact, help, nodes }] }]
export function buildReport(pages, { sourceHash, browser, axeVersion }) {
  const failing = pages.some((page) => page.violations.some((v) => failingImpacts.has(v.impact)));
  return {
    status: failing ? "failed" : "passed",
    standard: "WCAG 2.1 AA",
    tags: requiredTags,
    failOn: [...failingImpacts],
    engine: `axe-core ${axeVersion}`,
    browser,
    schemes,
    note,
    sourceHash,
    pages,
  };
}

export function validateReport(report, { routes, sourceHash }) {
  const problems = [];
  if (JSON.stringify(report.tags) !== JSON.stringify(requiredTags)) {
    problems.push(`tags are ${JSON.stringify(report.tags)}, not ${JSON.stringify(requiredTags)} (WCAG 2.1 A and AA)`);
  }
  if (report.sourceHash !== sourceHash) problems.push("the report is stale: the frontend source changed since it was made");
  const pages = report.pages ?? [];
  let failing = false;
  for (const route of routes) {
    for (const scheme of schemes) {
      const page = pages.find((p) => p.route === route && p.scheme === scheme);
      if (!page) {
        problems.push(`${route} was not checked in the ${scheme} scheme`);
        continue;
      }
      if (!(page.passes > 0)) problems.push(`${route} (${scheme}): axe ran no rule on this page`);
      if (route !== "login" && page.authenticated !== true) problems.push(`${route} (${scheme}): the page was not checked signed in`);
      for (const violation of page.violations ?? []) {
        if (!failingImpacts.has(violation.impact)) continue;
        failing = true;
        problems.push(`${route} (${scheme}): ${violation.impact} violation ${violation.id} on ${violation.nodes} element(s)`);
      }
    }
  }
  if (failing && report.status === "passed") problems.push("status says passed while a page holds a serious or critical violation");
  if (!failing && report.status !== "passed" && problems.length === 0) problems.push(`status is ${report.status}, not passed`);
  return problems;
}

// A fingerprint of the Angular source, line endings normalised so a Windows and a Linux checkout agree; the unit specs
// are left out because they do not change what a page looks like.
export function frontendSourceHash(root) {
  const listed = spawnSync("git", ["ls-files", "frontend/src"], { cwd: root, encoding: "utf8" });
  const hash = createHash("sha256");
  for (const file of listed.stdout.split(/\r?\n/).filter((f) => f && !f.endsWith(".spec.ts")).sort()) {
    hash.update(`${file}\n`);
    hash.update(readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n"));
  }
  return hash.digest("hex");
}

function run(root) {
  const dir = join(root, "target", "a11y");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpm, ["exec", "playwright", "test", "e2e/18-accessibility.spec.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, E2E_BROWSERS: "chromium", E2E_A11Y_DIR: dir },
  });
  const pages = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
  if (pages.length === 0) {
    console.error(`no result was written to ${dir}; the Playwright run failed before it checked a page (exit ${result.status})`);
    return 1;
  }
  // axe-core is a dependency of @axe-core/playwright, so pnpm keeps it out of the root node_modules.
  const fromPlaywrightPackage = createRequire(createRequire(join(root, "package.json")).resolve("@axe-core/playwright"));
  const axeVersion = fromPlaywrightPackage("axe-core/package.json").version;
  const report = buildReport(pages, { sourceHash: frontendSourceHash(root), browser: "chromium", axeVersion });
  mkdirSync(join(root, "docs", "qa"), { recursive: true });
  writeFileSync(join(root, reportPath), `${JSON.stringify(report, null, 2)}\n`);
  return verify(root);
}

function verify(root) {
  if (!existsSync(join(root, reportPath))) {
    console.error(`${reportPath} does not exist: run node scripts/check-a11y.mjs`);
    return 1;
  }
  const report = JSON.parse(readFileSync(join(root, reportPath), "utf8"));
  const routes = expectedRoutes(readFileSync(join(root, routesPath), "utf8"));
  const problems = validateReport(report, { routes, sourceHash: frontendSourceHash(root) });
  const minor = (report.pages ?? []).flatMap((p) => p.violations ?? []).filter((v) => !failingImpacts.has(v.impact)).length;
  if (problems.length > 0) {
    console.error(`a11y: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    return 1;
  }
  console.log(`a11y: PASS (${report.standard}, ${routes.length} routes x ${schemes.length} schemes, ${minor} minor or moderate finding(s) listed in ${reportPath})`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd();
  process.exit(process.argv.includes("--check") ? verify(root) : run(root));
}
