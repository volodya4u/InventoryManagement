// REFERENCE IMPLEMENTATION — deterministic trajectory validator.
//
// Sibling to check-traceability.mjs. Where check-traceability proves the
// REQUIREMENT chain, this proves the PROCESS each archived slice took — the
// part of "trajectory evaluation" that git/artifacts can prove, with exit
// codes (no LLM judgment):
//   - review evidence exists and is clean (review ran before archive);
//   - the slice's commits carry the `Slice:` trailer;
//   - module scope: which lib/<domain>/ each slice touched (cross-slice
//     overlaps flagged for drift review);
//   - the archived change folder has design.md + tasks.md.
//
// HONESTY BOUNDARY: it does NOT verify test-first ordering or "no test was
// weakened". Those are not derivable from one-commit-per-slice history — they
// are graded by the `trajectory-eval` workflow (a fresh LLM judge reading the
// diff). This script never claims what it cannot prove.
//
// Usage:
//   node scripts/check-trajectory.mjs                 # report + exit code
//   node scripts/check-trajectory.mjs --release       # missing evidence/trailer = FAIL
//   node scripts/check-trajectory.mjs --strict-scope  # cross-slice module overlap = FAIL
//   node scripts/check-trajectory.mjs --check-fresh   # committed report must match
//
// Outputs (deterministic, ASCII, no timestamps — safe to diff in CI):
//   docs/qa/trajectory-report.md   (generated — do not hand-edit)
//   trace/trajectory.json          (machine-readable)
//
// Wire as: "check:trajectory": "node scripts/check-trajectory.mjs"
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { addedLogLines, ignoredVerdicts, reviewProblems, reviewVerdicts } from "./check-review.mjs";
import { treeFingerprintAt } from "./dod-fingerprint.mjs";

const root = process.cwd();
const flags = new Set(process.argv.slice(2));
const PATHS = {
  archiveDir: "openspec/changes/archive",
  reportOut: "docs/qa/trajectory-report.md",
  jsonOut: "trace/trajectory.json",
};
// lib/<domain>/ dirs that are conventionally shared — never flagged as a
// cross-slice overlap.
const SHARED_DOMAINS = new Set(["auth", "db", "shared", "ui", "utils", "common", "email"]);

const failures = [];
const warnings = [];
const fail = (check, msg) => failures.push({ check, msg });
const warn = (check, msg) => warnings.push({ check, msg });
// A finding that is a hard FAIL only under a strictness flag, else a warning.
const gated = (on, check, msg) => (on ? fail(check, msg) : warn(check, msg));

const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
function git(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim() };
}
const isRepo = git(["rev-parse", "--is-inside-work-tree"]).ok;
if (!isRepo) warn("git", "not a git work tree — trailer/scope checks skipped");

// ADAPTATION (2026-10-22, owner-approved): this repository reviews with the `reviewer` subagent, whose verdict a hook
// records in .agent-log/actions.jsonl, not with the review workflow that writes review-findings.json. A slice without
// that file is reviewed when the pull request that merged it (the first merge on HEAD's first-parent line that brought
// in the newest commit carrying its trailer) added a verdict that passes the rule pr-evidence applies: the last
// hook-recorded verdict is APPROVE with 0 blocking, on the branch head's tree (scripts/check-review.mjs).
// A merged slice's answer never changes, so it is cached per newest trailer commit in the gitignored target/ folder;
// the cache also holds a hash of this script and check-review.mjs, so a rule change starts it afresh.
const mainLine = isRepo ? new Set(git(["rev-list", "--first-parent", "HEAD"]).out.split("\n")) : new Set();
// The newest commit on HEAD with a `Slice: <name>` line, per name, read in one pass (git log lists newest first). The
// line is matched whole, not as a git trailer: commits here often put it above the attribution, apart from the trailers.
const newestBySlice = new Map();
if (isRepo) {
  for (const entry of git(["log", "HEAD", "--grep=^Slice:", "--format=%H%n%B%x1e"]).out.split("\x1e")) {
    const [sha, ...body] = entry.trim().split("\n");
    for (const m of body.join("\n").matchAll(/^Slice:[ \t]*(\S+)[ \t]*$/gm)) if (!newestBySlice.has(m[1])) newestBySlice.set(m[1], sha);
  }
}
const CACHE = "target/trajectory/review-cache.json";
const RULES = createHash("sha256")
  .update(readFileSync(new URL(import.meta.url)))
  .update(readFileSync(new URL("./check-review.mjs", import.meta.url)))
  .digest("hex");
const cached = (() => {
  try {
    const c = JSON.parse(read(CACHE));
    return c.rules === RULES ? c.reviews : {};
  } catch {
    return {};
  }
})();
const cacheSize = Object.keys(cached).length;
function agentLogReview(trailerName) {
  const newest = newestBySlice.get(trailerName);
  if (!newest) return "missing";
  if (cached[newest]) return cached[newest];
  const merge = git(["rev-list", "--merges", "--ancestry-path", "--reverse", `${newest}..HEAD`]).out.split("\n").find((c) => mainLine.has(c));
  // Not merged yet (the branch of the slice itself): nothing to cache, a later run finds the merge.
  if (!merge) return "missing";
  return (cached[newest] = mergedReview(merge));
}
function mergedReview(merge) {
  const [base, head] = git(["rev-parse", `${merge}^1`, `${merge}^2`]).out.split("\n");
  let lines;
  try {
    lines = addedLogLines(base, head);
  } catch {
    return "missing";
  }
  if (!reviewVerdicts(lines).length && !ignoredVerdicts(lines).length) return "missing";
  const [problem] = reviewProblems(lines, treeFingerprintAt(root, head));
  return problem ? `not approved (agent log): ${problem}` : "approved (agent log)";
}
const REVIEWED = new Set(["clean", "approved (agent log)"]);

// ---------- discover archived slices ----------
const archiveAbs = join(root, PATHS.archiveDir);
const slices = existsSync(archiveAbs)
  ? readdirSync(archiveAbs).filter((e) => statSync(join(archiveAbs, e)).isDirectory())
  : [];

// slice -> { reviewEvidence, trailerCommits, libDomains[], processComplete }
const rows = [];
const domainToSlices = new Map(); // lib domain -> [slices]

for (const slice of slices) {
  const dir = join(PATHS.archiveDir, slice);
  // OpenSpec archives as `YYYY-MM-DD-add-<cap>`, but the commit trailer is the
  // bare `Slice: add-<cap>` — strip the date prefix so trailer matching works.
  const trailerName = slice.replace(/^\d{4}-\d{2}-\d{2}-/, "");

  // 1. review evidence
  let reviewEvidence = "missing";
  const rf = read(join(dir, "review-findings.json"));
  if (rf) {
    try {
      reviewEvidence = JSON.parse(rf).clean === true ? "clean" : "unclean";
    } catch {
      reviewEvidence = "unparseable";
    }
  } else if (isRepo) {
    reviewEvidence = agentLogReview(trailerName);
  }
  if (!REVIEWED.has(reviewEvidence)) {
    const what = rf || !isRepo ? `review-findings.json is ${reviewEvidence}` : `no review-findings.json, and the agent log's review is ${reviewEvidence}`;
    gated(flags.has("--release"), "review-evidence", `${slice}: ${what} (review must have run clean before archive)`);
  }

  // 2. process completeness
  const processComplete = existsSync(join(root, dir, "design.md")) && existsSync(join(root, dir, "tasks.md"));
  if (!processComplete) gated(flags.has("--release"), "process", `${slice}: archived change is missing design.md and/or tasks.md`);

  // 3 + 4. trailer presence + module scope (git)
  let trailerCommits = 0;
  let libDomains = [];
  if (isRepo) {
    const { ok, out } = git(["log", "--all", `--grep=Slice: ${trailerName}`, "--name-only", "--pretty=format:commit %H"]);
    if (ok) {
      const files = new Set();
      for (const line of out.split("\n")) {
        if (line.startsWith("commit ")) trailerCommits += 1;
        else if (line.trim()) files.add(line.trim());
      }
      for (const f of files) {
        const m = f.match(/^lib\/([^/]+)\//);
        if (m) {
          libDomains.push(m[1]);
        }
      }
      libDomains = [...new Set(libDomains)];
      for (const d of libDomains) {
        if (!domainToSlices.has(d)) domainToSlices.set(d, []);
        domainToSlices.get(d).push(slice);
      }
    }
    if (trailerCommits === 0) gated(flags.has("--release"), "trailer", `${slice}: no commit carries a "Slice: ${trailerName}" trailer`);
  }

  rows.push({ slice, reviewEvidence, trailerCommits, libDomains, processComplete });
}

// cross-slice module overlap (after all slices seen)
const overlaps = [];
for (const [domain, owners] of domainToSlices) {
  const uniq = [...new Set(owners)];
  if (uniq.length > 1 && !SHARED_DOMAINS.has(domain)) {
    overlaps.push({ domain, slices: uniq });
    gated(flags.has("--strict-scope"), "in-scope", `lib/${domain}/ modified by ${uniq.length} slices (${uniq.join(", ")}) — review for scope drift`);
  }
}

if (slices.length === 0) warn("slices", "no archived slices found under openspec/changes/archive/ (nothing to audit yet)");

// ---------- outputs ----------
const ok = (b) => (b ? "yes" : "**no**");
const report = `# Trajectory Report (generated - do not hand-edit)

Generated by \`node scripts/check-trajectory.mjs\`. Audits the PROCESS each
archived slice took: review evidence, \`Slice:\` trailers, and module scope.
It does NOT verify test-first ordering or test integrity (not derivable from
one-commit-per-slice history) — those are graded by the trajectory-eval workflow.

Scope: ${slices.length} archived slice(s).
Result: ${failures.length === 0 ? "PASS" : `FAIL (${failures.length} failure${failures.length === 1 ? "" : "s"})`}${warnings.length ? `, ${warnings.length} warning(s)` : ""}

| Slice | Review evidence | Trailer commits | design+tasks | lib domains touched |
|---|---|---|---|---|
${rows
  .map((r) => `| ${r.slice} | ${REVIEWED.has(r.reviewEvidence) ? r.reviewEvidence : `**${r.reviewEvidence.split(":")[0]}**`} | ${r.trailerCommits || "**0**"} | ${ok(r.processComplete)} | ${r.libDomains.join(", ") || "-"} |`)
  .join("\n")}

## Cross-slice module overlap

${overlaps.length ? overlaps.map((o) => `- \`lib/${o.domain}/\` touched by: ${o.slices.join(", ")}`).join("\n") : "None."}

## Failures

${failures.length ? failures.map((f) => `- **${f.check}**: ${f.msg}`).join("\n") : "None."}

## Warnings

${warnings.length ? warnings.map((w) => `- **${w.check}**: ${w.msg}`).join("\n") : "None."}
`;

if (Object.keys(cached).length !== cacheSize) {
  mkdirSync(join(root, "target", "trajectory"), { recursive: true });
  writeFileSync(join(root, CACHE), `${JSON.stringify({ rules: RULES, reviews: cached }, null, 2)}\n`);
}

const trajectory = {
  generatedBy: "scripts/check-trajectory.mjs",
  slices: rows,
  overlaps,
  failures,
  warnings,
};

if (flags.has("--check-fresh")) {
  const committed = read(PATHS.reportOut);
  if (committed === null) fail("freshness", `${PATHS.reportOut} does not exist — run the validator and commit it`);
  else if (committed.replace(/\r\n/g, "\n") !== report.replace(/\r\n/g, "\n")) fail("freshness", `${PATHS.reportOut} is stale — regenerate and commit`);
} else {
  mkdirSync(join(root, "trace"), { recursive: true });
  mkdirSync(join(root, "docs", "qa"), { recursive: true });
  writeFileSync(join(root, PATHS.reportOut), report);
  writeFileSync(join(root, PATHS.jsonOut), `${JSON.stringify(trajectory, null, 2)}\n`);
}

for (const w of warnings) console.warn(`WARN  [${w.check}] ${w.msg}`);
for (const f of failures) console.error(`FAIL  [${f.check}] ${f.msg}`);
console.log(`\nScope: ${slices.length} archived slice(s)`);
if (!flags.has("--check-fresh")) console.log(`wrote ${PATHS.reportOut} and ${PATHS.jsonOut}`);
console.log(`Result: ${failures.length ? "FAIL" : "PASS"}${warnings.length ? `, ${warnings.length} warning(s)` : ""}`);
process.exit(failures.length ? 1 : 0);
