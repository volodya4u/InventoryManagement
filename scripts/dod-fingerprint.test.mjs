// Unit tests for scripts/dod-fingerprint.mjs. Run: node --test scripts/dod-fingerprint.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { codeFingerprint } from "./dod-fingerprint.mjs";

const tmp = mkdtempSync(join(tmpdir(), "dod-fingerprint-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function repo(name) {
  const root = join(tmp, name);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, ".agent-log"), { recursive: true });
  writeFileSync(join(root, "src", "App.java"), "class App {}\n");
  writeFileSync(join(root, "docs", "notes.md"), "# notes\n");
  writeFileSync(join(root, "AGENTS.md"), "# rules\n");
  writeFileSync(join(root, ".agent-log", "actions.jsonl"), '{"event":"x"}\n');
  execFileSync("git", ["-C", root, "init", "-q"]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
  return root;
}

test("the fingerprint is stable for unchanged code", () => {
  const root = repo("stable");
  assert.equal(codeFingerprint(root), codeFingerprint(root));
});

test("a code change moves the fingerprint, uncommitted too", () => {
  const root = repo("code");
  const before = codeFingerprint(root);
  writeFileSync(join(root, "src", "App.java"), "class App { int x; }\n"); // not committed
  assert.notEqual(codeFingerprint(root), before);
});

test("a docs, .md or agent-log change does not move the fingerprint", () => {
  const root = repo("docs");
  const before = codeFingerprint(root);
  writeFileSync(join(root, "docs", "notes.md"), "# changed\n");
  writeFileSync(join(root, "AGENTS.md"), "# changed rules\n");
  writeFileSync(join(root, ".agent-log", "actions.jsonl"), '{"event":"y"}\n{"event":"z"}\n');
  assert.equal(codeFingerprint(root), before);
});

test("an untracked file does not move the fingerprint", () => {
  const root = repo("untracked");
  const before = codeFingerprint(root);
  writeFileSync(join(root, "src", "Scratch.java"), "class Scratch {}\n"); // never git add-ed
  assert.equal(codeFingerprint(root), before);
});
