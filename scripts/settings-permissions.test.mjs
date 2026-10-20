// Tests for the permission rules in .claude/settings.json (openspec/changes/git-output-deny-rules/). The allow rules
// Bash(git log *) and Bash(git diff *) also match `--output=<file>`, which writes any file, .git/config included, with
// no prompt; a deny rule wins over an allow rule. Edit ask rules must be anchored at the project root (`/path`), because
// a `./path` rule is relative to the current directory. Run: node --test scripts/settings-permissions.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { permissions } = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));

// A Bash rule matches the whole command text, and each `*` stands for any text, spaces included
// (code.claude.com/docs/en/permissions, "Wildcard patterns"); a trailing ` *` that is the rule's only wildcard also
// matches the bare command. Only that part of the matching is modelled here.
function bashRuleMatches(rule, command) {
  const body = /^Bash\((.*)\)$/.exec(rule)?.[1];
  if (body === undefined) return false;
  if (body.endsWith(" *") && body.indexOf("*") === body.length - 1 && command === body.slice(0, -2)) return true;
  const pattern = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(command);
}

const firstMatch = (command) => {
  for (const list of ["deny", "ask", "allow"]) {
    if (permissions[list].some((rule) => bashRuleMatches(rule, command))) return list;
  }
  return "none";
};

test("git log and git diff with --output, in both spellings git accepts, are denied", () => {
  for (const command of [
    "git log -1 --format=x --output=.git/config",
    "git log --output .git/config",
    "git diff --output=out.txt",
    "git diff HEAD --output out.txt",
  ]) {
    assert.equal(firstMatch(command), "deny", command);
  }
});

test("plain git log and git diff stay allowed without a prompt", () => {
  for (const command of ["git log --oneline -5", "git log", "git diff main...HEAD", "git diff --stat"]) {
    assert.equal(firstMatch(command), "allow", command);
  }
});

test("every Edit ask rule is anchored at the project root, push-branch.mjs included", () => {
  const edits = permissions.ask.filter((rule) => rule.startsWith("Edit("));
  assert.deepEqual(
    edits.filter((rule) => !rule.startsWith("Edit(/") || rule.startsWith("Edit(//")),
    [],
  );
  assert.ok(permissions.ask.includes("Edit(/scripts/push-branch.mjs)"));
});
