// Tests for scripts/generated-files.mjs and for its use in scripts/gate-status.mjs (ADR-0002 and ADR-0003: running the
// gate dashboard must not leave a modified tracked report behind). Run: node --test scripts/generated-files.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { snapshotFiles } from "./generated-files.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "generated-files-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function write(cwd, rel, text) {
  mkdirSync(dirname(join(cwd, rel)), { recursive: true });
  writeFileSync(join(cwd, rel), text);
}

test("restore puts a rewritten file back byte for byte, including CRLF line endings", () => {
  const cwd = join(tmp, "rewritten");
  write(cwd, "docs/report.md", "line one\r\nline two\r\n");
  const restore = snapshotFiles(cwd, ["docs/report.md"]);
  write(cwd, "docs/report.md", "a different report\n");
  assert.deepEqual(restore(), ["docs/report.md"]);
  assert.equal(readFileSync(join(cwd, "docs/report.md"), "utf8"), "line one\r\nline two\r\n");
});

test("restore puts back a file that was deleted and leaves an unchanged file alone", () => {
  const cwd = join(tmp, "deleted");
  write(cwd, "a.json", '{"a":1}\n');
  write(cwd, "b.json", '{"b":2}\n');
  const restore = snapshotFiles(cwd, ["a.json", "b.json"]);
  rmSync(join(cwd, "a.json"));
  assert.deepEqual(restore(), ["a.json"]);
  assert.equal(readFileSync(join(cwd, "a.json"), "utf8"), '{"a":1}\n');
});

test("restore does not create a file that did not exist when the snapshot was taken", () => {
  const cwd = join(tmp, "absent");
  mkdirSync(cwd, { recursive: true });
  const restore = snapshotFiles(cwd, ["trace/new.json"]);
  write(cwd, "trace/new.json", "{}\n");
  assert.deepEqual(restore(), []);
  assert.equal(existsSync(join(cwd, "trace/new.json")), true);
});

test("gate-status leaves the hook-owned reports as it found them", () => {
  const cwd = join(tmp, "dashboard");
  for (const file of ["gate-status.mjs", "generated-files.mjs", "hooks-pre-commit.mjs"]) {
    mkdirSync(join(cwd, "scripts"), { recursive: true });
    copyFileSync(join(scripts, file), join(cwd, "scripts", file));
  }
  // The release variants of the real checks rewrite these outputs in another form; the stand-ins do the same.
  const rewrite = (...outputs) =>
    `import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync("docs/qa", { recursive: true });\nmkdirSync("trace", { recursive: true });\n` +
    outputs.map((o) => `writeFileSync(${JSON.stringify(o)}, "rewritten by the release variant\\n");\n`).join("") +
    `console.log("Scope: 1");\nconsole.log("Result: PASS");\n`;
  write(cwd, "scripts/check-traceability.mjs", rewrite("docs/qa/traceability-report.md", "trace/trace.json"));
  write(cwd, "scripts/check-trajectory.mjs", rewrite("docs/qa/trajectory-report.md", "trace/trajectory.json"));
  const originals = {
    "docs/qa/traceability-report.md": "traceability as committed\r\n",
    "trace/trace.json": '{"committed":true}\n',
    "docs/qa/trajectory-report.md": "trajectory as committed\n",
    "trace/trajectory.json": '{"committed":"also"}\n',
  };
  for (const [rel, text] of Object.entries(originals)) write(cwd, rel, text);

  const r = spawnSync(process.execPath, ["scripts/gate-status.mjs"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FACTORY_TELEMETRY: "off" },
  });
  assert.match(`${r.stdout}${r.stderr}`, /Result: /, `gate-status did not finish:\n${r.stdout}${r.stderr}`);
  for (const [rel, text] of Object.entries(originals)) assert.equal(readFileSync(join(cwd, rel), "utf8"), text, rel);
});
