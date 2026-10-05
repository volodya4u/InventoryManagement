// Unit tests for scripts/dod-fingerprint.mjs. Run: node --test scripts/dod-fingerprint.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { codeFingerprint, codeFingerprintAt, treeFingerprint, treeFingerprintAt } from "./dod-fingerprint.mjs";

const tmp = mkdtempSync(join(tmpdir(), "dod-fingerprint-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const git = (root, ...args) => execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);

function repo(name) {
  const root = join(tmp, name);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, ".agent-log"), { recursive: true });
  writeFileSync(join(root, "src", "App.java"), "class App {}\n");
  writeFileSync(join(root, "docs", "notes.md"), "# notes\n");
  writeFileSync(join(root, "AGENTS.md"), "# rules\n");
  writeFileSync(join(root, ".agent-log", "actions.jsonl"), '{"event":"x"}\n');
  writeFileSync(join(root, ".gitignore"), "target/\n");
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
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

test("an untracked code file moves the fingerprint, an ignored one does not", () => {
  const root = repo("untracked");
  const before = codeFingerprint(root);
  mkdirSync(join(root, "target"), { recursive: true });
  writeFileSync(join(root, "target", "Built.class"), "bytes"); // ignored build output
  assert.equal(codeFingerprint(root), before);
  writeFileSync(join(root, "src", "NewTest.java"), "class NewTest {}\n"); // never git add-ed, but mvn verify runs it
  assert.notEqual(codeFingerprint(root), before);
});

test("dod's own output never moves the fingerprint, even where target/ is not ignored", () => {
  const root = repo("marker");
  writeFileSync(join(root, ".gitignore"), ""); // no ignore rules at all
  git(root, "commit", "-qam", "drop ignores");
  const before = codeFingerprint(root);
  const reviewed = treeFingerprint(root);
  mkdirSync(join(root, "target", "dod"), { recursive: true });
  writeFileSync(join(root, "target", "dod", "last-green.json"), '{"fingerprint":"x"}\n');
  writeFileSync(join(root, "target", "dod", "1.log"), "output\n");
  assert.equal(codeFingerprint(root), before);
  assert.equal(treeFingerprint(root), reviewed);
});

test("the working tree and the commit of the same content give the same fingerprint", () => {
  const root = repo("commit");
  writeFileSync(join(root, "src", "Feature.java"), "class Feature {}\n");
  const working = codeFingerprint(root);
  const reviewed = treeFingerprint(root);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "feature");
  assert.equal(codeFingerprintAt(root, "HEAD"), working);
  assert.equal(treeFingerprintAt(root, "HEAD"), reviewed);
  assert.notEqual(codeFingerprintAt(root, "HEAD~1"), working);
});

test("a CRLF working copy matches its LF commit, as a Windows checkout matches CI", () => {
  const root = repo("crlf");
  git(root, "config", "core.autocrlf", "true");
  writeFileSync(join(root, "src", "App.java"), "class App {\r\n}\r\n"); // what autocrlf checks out on Windows
  git(root, "add", "-A");
  git(root, "commit", "-qm", "crlf");
  assert.equal(codeFingerprint(root), codeFingerprintAt(root, "HEAD"));
});

test("a deleted file is absent, as in the commit that deletes it", () => {
  const root = repo("deleted");
  unlinkSync(join(root, "src", "App.java")); // not staged yet
  const working = codeFingerprint(root);
  git(root, "rm", "-q", "--cached", "src/App.java");
  git(root, "commit", "-qm", "delete");
  assert.equal(codeFingerprintAt(root, "HEAD"), working);
});

test("the review fingerprint covers docs but not the agent log", () => {
  const root = repo("review");
  const before = treeFingerprint(root);
  writeFileSync(join(root, ".agent-log", "actions.jsonl"), '{"event":"y"}\n');
  assert.equal(treeFingerprint(root), before);
  writeFileSync(join(root, "docs", "notes.md"), "# changed\n");
  assert.notEqual(treeFingerprint(root), before);
});
