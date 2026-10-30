#!/usr/bin/env node
// Vision gate (NFR-18, ADR-0011). Every page is screenshotted at a phone, a tablet and a desktop width, and a fresh
// `project-factory:vision-judge` agent looks at each screenshot and says whether the layout fits the width and is
// legible. The verdicts are written to docs/qa/vision-report.json. THIS PART IS AN LLM'S JUDGEMENT: it is not
// deterministic, and this script cannot tell that the judge ran; it checks that the report is complete, that each verdict
// belongs to the screenshot on disk, and that the frontend source did not change after the verdicts were made.
//
//   node scripts/check-vision.mjs                   verify docs/qa/vision-report.json (same as --check)
//   node scripts/check-vision.mjs capture           take the screenshots (needs the built JAR and Chromium) and start a
//                                                   new report with no verdicts
//   node scripts/check-vision.mjs record <file>     merge verdicts { "<shot id>": { met, readable, notes } } into the report
//
// The application has no dark theme (OQ-15 asked for both schemes). The dark screenshots are taken with
// `prefers-color-scheme: dark` emulated; when a dark screenshot is byte-identical to the light one only the light one is
// kept and judged, and when it differs it is kept and judged too.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedRoutes, frontendSourceHash } from "./check-a11y.mjs";

export const widths = [375, 768, 1280];
const reportPath = "docs/qa/vision-report.json";
const shotDir = "docs/qa/vision";
const routesPath = "frontend/src/app/app.routes.ts";
const judgeName = "project-factory:vision-judge";
const note =
  "LLM-judged and not deterministic: a fresh vision-judge agent looked at each screenshot and said whether the layout " +
  "fits the width and is legible. Another run can judge differently. check-vision.mjs verifies that the report is " +
  "complete, that the screenshots on disk are the ones judged and that the frontend source has not changed since; it " +
  "cannot verify that the judge ran.";

export const shotId = (route, width) => `${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}-${width}`;

export function shotsFor(routes) {
  return routes.flatMap((route) =>
    widths.map((width) => ({ id: shotId(route, width), route, width, file: `${shotDir}/${shotId(route, width)}.png` })),
  );
}

const isMet = (vision) => vision?.met === true && vision?.readable === true;

export function buildReport(shots, { sourceHash }) {
  const complete = shots.length > 0 && shots.every((s) => isMet(s.vision) && (s.darkIdentical || isMet(s.dark?.vision)));
  return {
    met: complete,
    kind: "vision-verify",
    judge: judgeName,
    deterministic: false,
    note,
    widths,
    sourceHash,
    shots,
  };
}

export function mergeVerdicts(report, verdicts) {
  const known = new Set(report.shots.map((s) => s.id));
  for (const id of Object.keys(verdicts)) if (!known.has(id)) throw new Error(`verdict for an unknown shot: ${id}`);
  const shots = report.shots.map((shot) =>
    verdicts[shot.id]
      ? { ...shot, vision: { met: verdicts[shot.id].met === true, readable: verdicts[shot.id].readable === true, notes: verdicts[shot.id].notes ?? "", judge: judgeName } }
      : shot,
  );
  return buildReport(shots, { sourceHash: report.sourceHash });
}

// fileHash(path) is the sha256 of a file under the project, or null when it does not exist.
export function validateReport(report, { routes, sourceHash, fileHash }) {
  const problems = [];
  if (report.deterministic !== false || !/LLM/.test(report.note ?? "")) {
    problems.push("the report must say it is LLM-judged and not deterministic (deterministic: false and a note naming the LLM)");
  }
  if (report.sourceHash !== sourceHash) problems.push("the report is stale: the frontend source changed since it was made");
  const shots = report.shots ?? [];
  let allJudged = true;
  for (const wanted of shotsFor(routes)) {
    const shot = shots.find((s) => s.id === wanted.id);
    if (!shot) {
      problems.push(`${wanted.id}: shot missing from the report`);
      allJudged = false;
      continue;
    }
    const onDisk = fileHash(shot.file);
    if (onDisk === null) problems.push(`${shot.id}: screenshot missing on disk (${shot.file})`);
    else if (onDisk !== shot.sha256) problems.push(`${shot.id}: the screenshot changed since it was judged`);
    if (!shot.vision) {
      problems.push(`${shot.id}: not judged`);
      allJudged = false;
    } else if (!isMet(shot.vision)) {
      problems.push(`${shot.id}: judged ${shot.vision.met ? "" : "not met"}${shot.vision.met || shot.vision.readable ? "" : " and "}${shot.vision.readable ? "" : "not readable"}: ${shot.vision.notes ?? ""}`);
      allJudged = false;
    }
    if (!shot.darkIdentical) {
      if (!shot.dark) {
        problems.push(`${shot.id}: the dark rendering differs from the light one and has no verdict of its own`);
        allJudged = false;
      } else {
        const darkOnDisk = fileHash(shot.dark.file);
        if (darkOnDisk === null) problems.push(`${shot.id}: dark screenshot missing on disk (${shot.dark.file})`);
        else if (darkOnDisk !== shot.dark.sha256) problems.push(`${shot.id}: the dark screenshot changed since it was judged`);
        if (!isMet(shot.dark.vision)) {
          problems.push(`${shot.id}: the dark rendering is not judged met and readable: ${shot.dark.vision?.notes ?? "not judged"}`);
          allJudged = false;
        }
      }
    }
  }
  if (report.met === true && !allJudged) problems.push("the report says met while a shot is not judged met and readable");
  if (report.met !== true && allJudged && problems.length === 0) problems.push("the report says not met although every shot is judged met");
  return problems;
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const hashUnder = (root) => (file) => (existsSync(join(root, file)) ? sha256(join(root, file)) : null);

function capture(root) {
  const dir = join(root, "target", "vision");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const run = spawnSync(pnpm, ["exec", "playwright", "test", "e2e/19-page-screenshots.spec.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, E2E_BROWSERS: "chromium", E2E_VISION_DIR: dir },
  });
  if (run.status !== 0) {
    console.error("the screenshot run failed");
    return 1;
  }
  const routes = expectedRoutes(readFileSync(join(root, routesPath), "utf8"));
  rmSync(join(root, shotDir), { recursive: true, force: true });
  mkdirSync(join(root, shotDir), { recursive: true });
  const taken = new Set(readdirSync(dir));
  const shots = [];
  for (const shot of shotsFor(routes)) {
    const light = `${shot.id}.light.png`;
    const dark = `${shot.id}.dark.png`;
    if (!taken.has(light) || !taken.has(dark)) {
      console.error(`${shot.id}: the run did not take both screenshots`);
      return 1;
    }
    copyFileSync(join(dir, light), join(root, shot.file));
    const entry = { ...shot, sha256: sha256(join(root, shot.file)), darkIdentical: sha256(join(dir, light)) === sha256(join(dir, dark)), vision: null };
    if (!entry.darkIdentical) {
      const darkFile = `${shotDir}/${shot.id}.dark.png`;
      copyFileSync(join(dir, dark), join(root, darkFile));
      entry.dark = { file: darkFile, sha256: sha256(join(root, darkFile)), vision: null };
    }
    shots.push(entry);
  }
  writeFileSync(join(root, reportPath), `${JSON.stringify(buildReport(shots, { sourceHash: frontendSourceHash(root) }), null, 2)}\n`);
  console.log(`vision: ${shots.length} screenshots taken, ${shots.filter((s) => s.darkIdentical).length} with an identical dark rendering; none judged yet`);
  return 0;
}

function record(root, file) {
  const report = JSON.parse(readFileSync(join(root, reportPath), "utf8"));
  const merged = mergeVerdicts(report, JSON.parse(readFileSync(file, "utf8")));
  writeFileSync(join(root, reportPath), `${JSON.stringify(merged, null, 2)}\n`);
  return verify(root);
}

function verify(root) {
  if (!existsSync(join(root, reportPath))) {
    console.error(`${reportPath} does not exist: run node scripts/check-vision.mjs capture, then judge the screenshots`);
    return 1;
  }
  const report = JSON.parse(readFileSync(join(root, reportPath), "utf8"));
  const routes = expectedRoutes(readFileSync(join(root, routesPath), "utf8"));
  const problems = validateReport(report, { routes, sourceHash: frontendSourceHash(root), fileHash: hashUnder(root) });
  if (problems.length > 0) {
    console.error(`vision: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    return 1;
  }
  console.log(`vision: PASS (${report.shots.length} shots judged met and readable by ${report.judge}; LLM-judged, not deterministic)`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd();
  const [command, argument] = process.argv.slice(2);
  if (command === "capture") process.exit(capture(root));
  else if (command === "record") process.exit(record(root, argument));
  else process.exit(verify(root));
}
