#!/usr/bin/env node
// Pushes the current branch to origin, and nothing else, when it is one of ours: `claude/<name>`. This is the push step of
// the finish flow (CLAUDE.md), and the only push `.claude/settings.json` allows without a prompt. The permission rule is the
// exact command `node scripts/push-branch.mjs`, so no flag, refspec or second ref can ride along the way they can with a
// wildcard such as `git push origin claude/*` (`+main`, `:other-branch`, `--mirror`, `-uf` all match a wildcard).
// Usage: node scripts/push-branch.mjs   (no arguments; exit code 0 = pushed, 2 = refused, otherwise git's)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// A conservative subset of git's branch-name rules: `claude/` plus letters, digits, `.`, `_` and `-`, starting with a letter
// or digit. That rules out `main`, any other prefix, `:` (a refspec), `+` (a forced refspec), spaces and shell characters.
export const BRANCH = /^claude\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

// The git arguments that push exactly this branch to the branch of the same name, or an error saying why not.
export function pushArguments(branch) {
  if (!BRANCH.test(branch) || branch.includes("..") || branch.endsWith(".") || branch.endsWith(".lock")) {
    throw new Error(`refusing to push ${JSON.stringify(branch)}: only a branch named claude/<name> is pushed by this script`);
  }
  return ["push", "-u", "origin", `refs/heads/${branch}:refs/heads/${branch}`];
}

function main() {
  if (process.argv.length > 2) {
    console.error("push-branch takes no arguments: it pushes the current claude/* branch to origin.");
    process.exit(2);
  }
  let branch;
  try {
    branch = execFileSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    branch = ""; // detached HEAD
  }
  let args;
  try {
    args = pushArguments(branch);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  try {
    execFileSync("git", args, { stdio: "inherit" });
  } catch (error) {
    process.exit(error.status ?? 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
