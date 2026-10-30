// Tests for scripts/check-vision.mjs: a vision report is only evidence when every page was judged at every width, the
// verdicts are for the screenshots on disk, the frontend source did not change since, and the report says it is an LLM's
// judgement. Run: node --test scripts/check-vision.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport, mergeVerdicts, shotId, shotsFor, validateReport, widths } from "./check-vision.mjs";

const routes = ["login", "reports/monthly-sales"];
const hashes = new Map();
const fileHash = (file) => hashes.get(file) ?? null;
const judged = { met: true, readable: true, notes: "ok", judge: "project-factory:vision-judge" };

function judgedReport() {
  const shots = shotsFor(routes).map((shot) => {
    hashes.set(shot.file, `hash-of-${shot.id}`);
    return { ...shot, sha256: `hash-of-${shot.id}`, darkIdentical: true, vision: judged };
  });
  return buildReport(shots, { sourceHash: "abc" });
}
const check = (report, extra = {}) => validateReport(report, { routes, sourceHash: "abc", fileHash, ...extra });

test("a shot is a page at one of the three widths, with a file named after both", () => {
  assert.deepEqual(widths, [375, 768, 1280]);
  assert.equal(shotId("reports/monthly-sales", 375), "reports-monthly-sales-375");
  const shots = shotsFor(routes);
  assert.equal(shots.length, routes.length * widths.length);
  assert.equal(shots[0].file, "docs/qa/vision/login-375.png");
});

test("a report where every shot is judged met and readable passes and says met", () => {
  const report = judgedReport();
  assert.equal(report.met, true);
  assert.deepEqual(check(report), []);
});

test("the report says it is an LLM's judgement and not deterministic", () => {
  const report = judgedReport();
  assert.equal(report.deterministic, false);
  assert.match(report.note, /LLM/);
  const problems = check({ ...report, deterministic: true });
  assert.ok(problems.some((p) => /LLM/.test(p) || /deterministic/.test(p)), problems.join("\n"));
});

test("a shot nobody judged keeps the report from being met", () => {
  const report = judgedReport();
  report.shots[2] = { ...report.shots[2], vision: null };
  const rebuilt = buildReport(report.shots, { sourceHash: "abc" });
  assert.equal(rebuilt.met, false);
  assert.ok(check(rebuilt).some((p) => /not judged/.test(p) && /login-1280/.test(p)));
});

test("a shot judged not readable or not met is a problem naming the shot and the note", () => {
  const report = judgedReport();
  report.shots[1] = { ...report.shots[1], vision: { met: true, readable: false, notes: "text overlaps the menu" } };
  const rebuilt = buildReport(report.shots, { sourceHash: "abc" });
  assert.equal(rebuilt.met, false);
  assert.ok(check(rebuilt).some((p) => /login-768/.test(p) && /text overlaps the menu/.test(p)));
});

test("a report that says met while a shot is not is refused", () => {
  const report = judgedReport();
  report.shots[0] = { ...report.shots[0], vision: { met: false, readable: true, notes: "dead-looking button" } };
  assert.ok(check({ ...report, met: true }).some((p) => /met/.test(p)));
});

test("a missing page or width is a problem", () => {
  const report = judgedReport();
  const rebuilt = buildReport(report.shots.filter((s) => s.id !== "reports-monthly-sales-768"), { sourceHash: "abc" });
  assert.ok(check(rebuilt).some((p) => /reports-monthly-sales-768/.test(p) && /missing/.test(p)));
});

test("a route the router has but the report lacks is a problem", () => {
  assert.ok(check(judgedReport(), { routes: [...routes, "sales"] }).some((p) => /sales-375/.test(p)));
});

test("a screenshot that changed or vanished since it was judged is a problem", () => {
  const report = judgedReport();
  hashes.set(report.shots[0].file, "another-image");
  hashes.delete(report.shots[1].file);
  const problems = check(report);
  assert.ok(problems.some((p) => /login-375/.test(p) && /changed/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /login-768/.test(p) && /missing on disk/.test(p)), problems.join("\n"));
});

test("a report made from other frontend source is stale", () => {
  assert.ok(check(judgedReport(), { sourceHash: "def" }).some((p) => /stale/.test(p)));
});

test("a dark rendering that differs from the light one must be judged too", () => {
  const report = judgedReport();
  report.shots[0] = { ...report.shots[0], darkIdentical: false };
  assert.ok(check(buildReport(report.shots, { sourceHash: "abc" })).some((p) => /login-375/.test(p) && /dark/.test(p)));
  report.shots[0] = { ...report.shots[0], dark: { file: "docs/qa/vision/login-375.dark.png", sha256: "d", vision: judged } };
  hashes.set("docs/qa/vision/login-375.dark.png", "d");
  assert.deepEqual(check(buildReport(report.shots, { sourceHash: "abc" })), []);
});

test("verdicts from the judge are merged by shot id, and an unknown id is refused", () => {
  const base = buildReport(
    shotsFor(routes).map((shot) => ({ ...shot, sha256: "h", darkIdentical: true, vision: null })),
    { sourceHash: "abc" },
  );
  assert.equal(base.met, false);
  const verdicts = Object.fromEntries(base.shots.map((s) => [s.id, { met: true, readable: true, notes: "fine" }]));
  const merged = mergeVerdicts(base, verdicts);
  assert.equal(merged.met, true);
  assert.equal(merged.shots[0].vision.judge, "project-factory:vision-judge");
  assert.throws(() => mergeVerdicts(base, { "no-such-shot": { met: true, readable: true, notes: "" } }), /no-such-shot/);
});
