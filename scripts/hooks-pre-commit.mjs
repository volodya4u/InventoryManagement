#!/usr/bin/env node
// Git pre-commit hook, run through .githooks/pre-commit (ADR-0002). Fast, staged-scope checks only:
//   1. refuse real env files and obvious secrets in staged files;
//   2. run the traceability and trajectory checks, which regenerate their reports, and stage the reports so a commit
//      always carries fresh ones (CI runs `--check-fresh`);
//   3. refuse while a correction in retro/corrections/ has no disposition.
// Adapted from the factory's template, whose ESLint and `tsc --noEmit` steps do not exist in this repo.
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function envFiles(staged) {
  return staged.filter((file) => /(^|\/)\.env(\.|$)/.test(file) && !file.endsWith(".example"));
}

const SECRET_PATTERNS = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["service token", /\b(?:sk|rk|re|ghp|gho|xox[bap])_[A-Za-z0-9]{16,}\b/],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["database URL with a password", /postgres(?:ql)?:\/\/[^\s'"]+:[^\s'"]+@/],
  // AGENTS.md: never write a real password in the repo. A value is anything but empty, a ${...} reference or a <placeholder>, quoted or not; the name inside ${...} is not an assignment.
  ["the admin bootstrap password", /(?<!\$\{)APP_ADMIN_INITIAL_PASSWORD[ \t]*[:=][ \t]*(?!\$\{)(?!["']?<)(?!["']?[ \t]*\r?$)\S/m],
];

export function secretHits(content) {
  return SECRET_PATTERNS.filter(([, pattern]) => pattern.test(content)).map(([name]) => name);
}

export function isScannable(file) {
  // The agent log records command text and every commit stages it, so scanning it would only ever flag itself.
  return !file.startsWith(".agent-log/") && !/\.(png|webm|jpe?g|gif|pdf|ico|woff2?|db|jar|zip)$/i.test(file);
}

const GENERATED = [
  ["scripts/check-traceability.mjs", ["docs/qa/traceability-report.md", "trace/trace.json"]],
  ["scripts/check-trajectory.mjs", ["docs/qa/trajectory-report.md", "trace/trajectory.json"]],
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACM"]).split("\n").filter(Boolean);

  const envs = envFiles(staged);
  if (envs.length) {
    console.error(`pre-commit: refusing to commit env file(s): ${envs.join(", ")}`);
    process.exit(1);
  }
  for (const file of staged.filter(isScannable)) {
    let content;
    try {
      content = git(["show", `:${file}`]);
    } catch {
      continue;
    }
    const hits = secretHits(content);
    if (hits.length) {
      console.error(`pre-commit: possible secret in ${file} (${hits.join(", ")}). Use an environment variable instead.`);
      process.exit(1);
    }
  }

  for (const [script, outputs] of GENERATED) {
    run(script);
    git(["add", ...outputs]);
  }
  run("scripts/correct.mjs", ["--check"]);
  console.log("pre-commit: all deterministic checks passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
