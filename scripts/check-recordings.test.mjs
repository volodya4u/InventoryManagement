// Tests for scripts/check-recordings.mjs: a manifest is only evidence when its clips are real files whose flow passed.
// Each test builds a throwaway project with a manifest and clip files, and runs the real script in it.
// Run: node --test scripts/check-recordings.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "check-recordings-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const DIR = "docs/qa/demo-recordings";
const clip = (extra = {}) => ({
  id: "01-signs-in",
  title: "signs in",
  proof: "FR-1",
  video: `${DIR}/01-signs-in.webm`,
  screenshot: `${DIR}/01-signs-in.png`,
  asserted: true,
  ...extra,
});

// files: path -> text or a byte count (a file of that many bytes).
function project(name, results, files = { [`${DIR}/01-signs-in.webm`]: 20000, [`${DIR}/01-signs-in.png`]: 100 }) {
  const cwd = join(tmp, name);
  const all = { [`${DIR}/manifest.json`]: JSON.stringify({ kind: "demo", results }), "src/main/Code.java": "class Code {}", ...files };
  for (const [rel, content] of Object.entries(all)) {
    mkdirSync(dirname(join(cwd, rel)), { recursive: true });
    writeFileSync(join(cwd, rel), typeof content === "number" ? Buffer.alloc(content, 1) : content);
  }
  return cwd;
}

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [join(scripts, "check-recordings.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FACTORY_TELEMETRY: "off" },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("a clip whose video and screenshot exist and whose flow passed is evidence", () => {
  const cwd = project("good", [clip()]);

  const { status, out } = run(cwd);

  assert.equal(status, 0, out);
  assert.match(readFileSync(join(cwd, "docs/qa/recordings-report.md"), "utf8"), /Result: PASS/);
});

test("a manifest whose video is not on disk fails", () => {
  const cwd = project("missing-video", [clip()], { [`${DIR}/01-signs-in.png`]: 100 });

  const { status, out } = run(cwd);

  assert.equal(status, 1, out);
  assert.match(out, /video missing on disk/);
});

test("a video too small to be a recording fails", () => {
  const cwd = project("tiny-video", [clip()], { [`${DIR}/01-signs-in.webm`]: 50, [`${DIR}/01-signs-in.png`]: 100 });

  const { status, out } = run(cwd);

  assert.equal(status, 1, out);
  assert.match(out, /video too small/);
});

test("a clip whose flow did not pass is not evidence", () => {
  const cwd = project("not-asserted", [clip({ asserted: false })]);

  const { status, out } = run(cwd);

  assert.equal(status, 1, out);
  assert.match(out, /not marked "asserted: true"/);
});

test("no recorded clip while product code exists is not earned, never a pass", () => {
  const cwd = project("nothing-recorded", []);

  const { status, out } = run(cwd);

  assert.equal(status, 1, out);
  assert.match(out, /NOT-EARNED/);
});

test("--check-fresh fails when the committed report is stale", () => {
  const cwd = project("stale", [clip()]);
  run(cwd);
  writeFileSync(join(cwd, "docs/qa/recordings-report.md"), "old\n");

  const { status, out } = run(cwd, "--check-fresh");

  assert.equal(status, 1, out);
  assert.match(out, /stale/);
});
