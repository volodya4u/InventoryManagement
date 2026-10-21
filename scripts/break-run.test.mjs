// Tests for scripts/break-run.mjs and scripts/break-replay.mjs. Each case builds a throwaway repository with a tiny
// module and its node:test file, and drives the real workflow through scripts/test-run.mjs's runner, so the records
// are the ones a real run writes. Run: node --test scripts/break-run.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { EVIDENCE_DIR, breakRun, isTestPath, restoreRun, startRun } from "./break-run.mjs";
import { replayRun } from "./break-replay.mjs";

const tmp = mkdtempSync(join(tmpdir(), "break-run-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const git = (root, ...args) => execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" }).trim();
// The edited line has a blank line as the last line of its trailing context, as Java and TypeScript files often do: a
// patch whose trailing whitespace was trimmed would lose that line and no longer apply in reverse.
const GOOD = "export const add = (a, b) => a + b;\n\nexport const sub = (a, b) => a - b;\n\n";
const BROKEN = "export const add = (a, b) => a - b;\n\nexport const sub = (a, b) => a - b;\n\n";
const TEST = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { add } from "./lib.mjs";\ntest("adds two numbers", () => assert.equal(add(2, 3), 5));\n';

let n = 0;
function repo({ autocrlf } = {}) {
  const root = join(tmp, `repo-${++n}`);
  execFileSync("git", ["init", "-q", root]);
  if (autocrlf) git(root, "config", "core.autocrlf", "true");
  writeFileSync(join(root, ".gitignore"), "target/\n.agent-log/\n");
  writeFileSync(join(root, "lib.mjs"), GOOD);
  writeFileSync(join(root, "lib.test.mjs"), TEST);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  return root;
}
const records = (root) =>
  existsSync(join(root, ".agent-log", "pending.jsonl"))
    ? readFileSync(join(root, ".agent-log", "pending.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.event === "BreakRun")
    : [];
// As git compares them: a checkout on Windows may write CRLF line endings for the same content.
const text = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const own = "lib.test.mjs › adds two numbers";
// A complete run of the controlled break, committed with its evidence: what a reviewer replays. A header above the code
// moves the patch's hunk off line 1, where git apply would only look for it at the start of the file.
function recorded({ header = "", autocrlf } = {}) {
  const root = repo({ autocrlf });
  if (header) {
    writeFileSync(join(root, "lib.mjs"), `${header}${GOOD}`);
    git(root, "commit", "-qam", "a header");
  }
  const { id } = startRun(root, "harness", "lib.test.mjs");
  writeFileSync(join(root, "lib.mjs"), `${header}${BROKEN}`);
  breakRun(root, id);
  restoreRun(root, id);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "the evidence");
  return { root, id };
}

test("start, break and restore record the patch, the fingerprints and each test's results under one run id", () => {
  const root = repo();
  const started = startRun(root, "harness", "lib.test.mjs");
  assert.equal(started.ok, true, started.problem);
  writeFileSync(join(root, "lib.mjs"), BROKEN); // the controlled break, made by hand
  const broken = breakRun(root, started.id);
  assert.equal(broken.ok, true, broken.problem);
  const restored = restoreRun(root, started.id);
  assert.equal(restored.ok, true, restored.problem);

  assert.equal(text(join(root, "lib.mjs")), GOOD, "the restore put the code back");
  const dir = join(root, EVIDENCE_DIR, started.id);
  assert.match(text(join(dir, "mutation.patch")), /^-export const add = \(a, b\) => a \+ b;$/m);
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  assert.deepEqual(run.steps.map((s) => s.step), ["start", "break", "restore"]);

  const [start, brk, restore] = records(root);
  assert.deepEqual([start.step, brk.step, restore.step], ["start", "break", "restore"]);
  assert.ok([start, brk, restore].every((r) => r.run === started.id && r.structured === true));
  assert.equal(start.code, restore.code, "restored to the code it started from");
  assert.notEqual(brk.code, start.code, "the break changed the code");
  assert.deepEqual(brk.results.map((t) => [t.id, t.status]), [[own, "assertion"]]);
  assert.deepEqual([start.results[0].status, restore.results[0].status], ["pass", "pass"]);
  assert.equal(brk.patchSha256, restore.patchSha256);
  assert.deepEqual(brk.patchFiles, ["lib.mjs"]);
});

test("a break that edits the test file, changes nothing, or starts from a red test is refused", () => {
  const red = repo();
  writeFileSync(join(red, "lib.mjs"), BROKEN);
  assert.match(startRun(red, "harness", "lib.test.mjs").problem, /must be green before the break/);

  const nothing = repo();
  const a = startRun(nothing, "harness", "lib.test.mjs");
  assert.match(breakRun(nothing, a.id).problem, /no code changed since the start/);

  const testEdit = repo();
  const b = startRun(testEdit, "harness", "lib.test.mjs");
  writeFileSync(join(testEdit, "lib.test.mjs"), TEST.replace("5)", "6)"));
  assert.match(breakRun(testEdit, b.id).problem, /the break edits the test file lib\.test\.mjs/);
  assert.equal(records(testEdit).filter((r) => r.step === "break").length, 0, "a refused break records nothing");
});

test("replay applies the recorded patch, sees the test fail as recorded, and leaves the tree as it was", () => {
  const { root, id } = recorded();
  const head = git(root, "rev-parse", "HEAD");

  const replay = replayRun(root, id);
  assert.deepEqual(replay.problems, [], replay.lines.join("\n"));
  assert.equal(text(join(root, "lib.mjs")), GOOD);
  assert.equal(git(root, "status", "--porcelain"), "", "the tree is as it was");
  assert.equal(git(root, "rev-parse", "HEAD"), head);

  // A tree with uncommitted changes is not replayed (the reverse could not be told from them).
  writeFileSync(join(root, "lib.mjs"), `${GOOD}// local edit\n`);
  assert.match(replayRun(root, id).problems.join(" "), /working tree has changes/);
});

test("restore accepts a break undone by hand and refuses a tree that is not the start's", () => {
  // The author undid the break by hand (or git apply -R failed and they put it back): the tree is the start's already.
  const undone = repo();
  const a = startRun(undone, "harness", "lib.test.mjs");
  writeFileSync(join(undone, "lib.mjs"), BROKEN);
  assert.equal(breakRun(undone, a.id).ok, true);
  writeFileSync(join(undone, "lib.mjs"), GOOD);
  const restored = restoreRun(undone, a.id);
  assert.equal(restored.ok, true, restored.problem);
  assert.equal(records(undone).filter((r) => r.step === "restore").length, 1);

  // An edit made after the break is not part of the patch: the reversed tree is not the start's, so nothing is recorded.
  const extra = repo();
  const b = startRun(extra, "harness", "lib.test.mjs");
  writeFileSync(join(extra, "lib.mjs"), BROKEN);
  breakRun(extra, b.id);
  writeFileSync(join(extra, "extra.mjs"), "export const later = 1;\n");
  assert.match(restoreRun(extra, b.id).problem, /not the start's \(extra\.mjs\)/);
  assert.equal(records(extra).filter((r) => r.step === "restore").length, 0);
});

test("a break that touches any test path is refused, not only the run's own test file", () => {
  const tests = ["src/test/java/com/x/FlowTest.java", "src/test/resources/seed.sql", "frontend/src/app/a.spec.ts", "frontend/src/app/b.test.ts", "scripts/other.test.mjs", "scripts/fixtures/report.xml", "frontend/src/__fixtures__/x.json"];
  for (const path of tests) assert.equal(isTestPath(path), true, path);
  for (const path of ["src/main/java/com/x/Flow.java", "src/main/resources/schema.sql", "scripts/test-run.mjs", "scripts/test-results.mjs", "frontend/src/app/app.ts"]) {
    assert.equal(isTestPath(path), false, path);
  }

  const root = repo();
  const { id } = startRun(root, "harness", "lib.test.mjs");
  writeFileSync(join(root, "lib.mjs"), BROKEN);
  mkdirSync(join(root, "fixtures"));
  writeFileSync(join(root, "fixtures", "cases.json"), "[]\n"); // another test's input, not the code under test
  assert.match(breakRun(root, id).problem ?? "", /the break edits the test file fixtures\/cases\.json/);
  assert.equal(records(root).filter((r) => r.step === "break").length, 0, "a refused break records nothing");
});

test("replay judges the tree by its content as git stores it, so a file git status flags with unchanged content does not fail it", () => {
  // The flag a CRLF checkout leaves: with core.autocrlf=true, git apply -R writes an LF working copy back with CRLF line
  // endings, and git status lists the file, since its size changed, although its blob id is HEAD's.
  const { root, id } = recorded({ autocrlf: true });
  writeFileSync(join(root, "lib.mjs"), GOOD); // an LF working copy, as an editor or a script writes one
  git(root, "add", "-A");
  assert.equal(git(root, "status", "--porcelain"), "", "a clean tree before the replay");
  const replay = replayRun(root, id);
  assert.deepEqual(replay.problems, [], replay.lines.join("\n"));
  assert.match(git(root, "status", "--porcelain"), /^M lib\.mjs$/m, "git status lists the file the reverse rewrote");
  assert.equal(git(root, "hash-object", "lib.mjs"), git(root, "rev-parse", "HEAD:lib.mjs"), "its content, as git stores it, is HEAD's");
});

test("replay refuses a run that was never restored, or whose test file is not the one the run recorded", () => {
  const unrestored = repo();
  const { id } = startRun(unrestored, "harness", "lib.test.mjs");
  writeFileSync(join(unrestored, "lib.mjs"), BROKEN);
  breakRun(unrestored, id);
  writeFileSync(join(unrestored, "lib.mjs"), GOOD); // undone by hand, never through restore
  git(unrestored, "add", "-A");
  git(unrestored, "commit", "-qm", "an incomplete run");
  assert.match(replayRun(unrestored, id).problems.join(" "), /was never restored/);

  const { root, id: run } = recorded();
  writeFileSync(join(root, "lib.test.mjs"), TEST.replace("adds two numbers", "adds two other numbers"));
  git(root, "commit", "-qam", "the test changed after the run");
  const replay = replayRun(root, run);
  assert.match(replay.problems.join(" "), /lib\.test\.mjs is not the test file the run recorded/);
  assert.deepEqual(replay.lines, [], "nothing was applied or run");
});

test("replay refuses a mutation.patch that is not the patch the run recorded, and changes nothing", () => {
  const { root, id } = recorded();
  const patch = join(root, EVIDENCE_DIR, id, "mutation.patch");
  // Still a patch that applies and breaks the test, but not the bytes the run hashed.
  writeFileSync(patch, readFileSync(patch, "latin1").replace("+export const add = (a, b) => a - b;", "+export const add = (a, b) => a * b;"), "latin1");
  git(root, "commit", "-qam", "a patch edited after the run");
  const replay = replayRun(root, id);
  assert.match(replay.problems.join(" "), /mutation\.patch is not the patch the run recorded/);
  assert.equal(text(join(root, "lib.mjs")), GOOD);
  assert.equal(git(root, "status", "--porcelain"), "", "nothing was applied");
});

test("replay reports a recorded break that no longer fails its test", () => {
  const header = "// one\n// two\n// three\n// four\n";
  const { root, id } = recorded({ header });
  // The code moved on: the patch still applies (git finds its lines in the comment, at an offset), but the break no
  // longer reaches the add the test calls.
  const moved = `export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n/*\n${header}${GOOD}*/\n`;
  writeFileSync(join(root, "lib.mjs"), moved);
  git(root, "commit", "-qam", "the code moved on");
  const replay = replayRun(root, id);
  assert.match(replay.problems.join(" "), /lib\.test\.mjs › adds two numbers was recorded failing on an assertion, but the replay saw pass/);
  assert.equal(text(join(root, "lib.mjs")), moved, "the patch was reversed");
});
