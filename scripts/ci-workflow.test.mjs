import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ciWorkflow = () => readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");

// GitHub's flags: an unspecified shell runs `bash -e {0}`, `shell: bash` runs `bash --noprofile --norc -eo pipefail {0}`.
const PLAIN = ["-e", "-c"];
const PIPEFAIL = ["--noprofile", "--norc", "-eo", "pipefail", "-c"];
const TEE = /^(.*?)\s*\|\s*(tee\b.*)$/;

function bashExecutable() {
  if (process.platform !== "win32") return "bash";
  const gitCommands = execFileSync("where.exe", ["git"], { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const git of gitCommands) {
    const bash = join(dirname(dirname(git)), "bin", "bash.exe");
    if (existsSync(bash)) return bash;
  }
  throw new Error("Git for Windows Bash is required to exercise the CI pipeline");
}

const indentOf = (line) => line.search(/\S/);

// The lines under lines[start] that are indented deeper than it (blank lines included).
function block(lines, start) {
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && indentOf(line) <= indentOf(lines[start])) break;
    body.push(line);
  }
  return body;
}

// `defaults.run.shell` of the mapping whose keys sit `indent` spaces deep (the workflow: 0, a job: 4).
function defaultShell(lines, indent) {
  const pad = " ".repeat(indent);
  const defaults = lines.findIndex((line) => new RegExp(`^${pad}defaults:\\s*$`).test(line));
  const runDefaults = defaults >= 0 ? block(lines, defaults) : [];
  const run = runDefaults.findIndex((line) => new RegExp(`^${pad}  run:\\s*$`).test(line));
  const shell = run >= 0 ? block(runDefaults, run).find((line) => line.startsWith(`${pad}    shell:`)) : undefined;
  return shell?.slice(indent + 10).trim();
}

// Every step of every job, read by indentation (no YAML dependency): its name, its own shell, its job's default shell
// and its run lines.
function workflowSteps(text) {
  const lines = text.split(/\r?\n/);
  const jobs = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  assert.ok(jobs >= 0, "the workflow has jobs");
  const steps = [];
  let job = null;
  let current = null;
  for (const line of block(lines, jobs)) {
    if (/^  [\w-]+:\s*$/.test(line)) job = { lines: [] };
    job?.lines.push(line);
    if (/^      - /.test(line)) steps.push({ job, lines: (current = [line.replace(/^      - /, "        ")]) });
    else if (current && (!line.trim() || indentOf(line) > 6)) current.push(line);
    else current = null;
  }
  return steps.map(({ job, lines: step }) => {
    const value = (key) => step.find((line) => line.startsWith(`        ${key}:`))?.slice(key.length + 9).trim();
    const runAt = step.findIndex((line) => line.startsWith("        run:"));
    let run = [];
    if (runAt >= 0) {
      run = /^[|>][-+]?$/.test(value("run"))
        ? block(step, runAt).filter((line) => line.trim()).map((line) => line.slice(10))
        : [value("run")];
    }
    return { name: value("name"), shell: value("shell"), jobShell: defaultShell(job.lines, 4), run };
  });
}

// GitHub's precedence: the step's own shell, else its job's `defaults.run.shell`, else the workflow's.
function bashArgs(text, step) {
  const shell = step.shell ?? step.jobShell ?? defaultShell(text.split(/\r?\n/), 0);
  if (shell === undefined) return PLAIN;
  assert.equal(shell, "bash", `step "${step.name}" uses a shell this test does not model`);
  return PIPEFAIL;
}

// The step's tee pipelines with the left command replaced by `(exit <code>)`, run under the resolved shell.
function pipelineExitCodes(text, step, exitCode) {
  const workspace = mkdtempSync(join(tmpdir(), "ci-tee-")).replace(/\\/g, "/");
  try {
    mkdirSync(join(workspace, "target"));
    return step.run
      .filter((line) => TEE.test(line))
      .map((line) => {
        const probe = `true\n${line.replace(TEE, `(exit ${exitCode}) | $2`)}`;
        const result = spawnSync(bashExecutable(), [...bashArgs(text, step), probe], {
          encoding: "utf8",
          env: { ...process.env, GITHUB_WORKSPACE: workspace, GITHUB_STEP_SUMMARY: `${workspace}/summary.md` },
        });
        assert.equal(result.error, undefined, `Bash did not run: ${result.error}`);
        return result.status;
      });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("pr-evidence CI step propagates a failed gate through tee", () => {
  const workflow = ciWorkflow();
  const step = workflowSteps(workflow).find((s) => s.name === "Evidence from the agent log and the specs");
  assert.ok(step, "the evidence step exists");
  const pipeline = step.run.find((line) => line.includes("scripts/pr-evidence.mjs"));
  assert.match(pipeline ?? "", /^node scripts\/pr-evidence\.mjs .* \| tee -a "\$GITHUB_STEP_SUMMARY"$/);
  for (const exitCode of [17, 0]) assert.deepEqual(pipelineExitCodes(workflow, step, exitCode), [exitCode]);
});

test("every tee step in ci.yml propagates its command's failure", () => {
  const workflow = ciWorkflow();
  const teeSteps = workflowSteps(workflow).filter((step) => step.run.some((line) => TEE.test(line)));
  const names = teeSteps.map((step) => step.name);
  for (const known of ["Frontend unit tests", "Dynamic context (angular-cli MCP)", "Evidence from the agent log and the specs"]) {
    assert.ok(names.includes(known), `the tee step "${known}" was found (found: ${names.join(", ")})`);
  }
  const masked = [];
  for (const step of teeSteps) {
    for (const exitCode of [17, 0]) {
      const codes = pipelineExitCodes(workflow, step, exitCode);
      if (codes.some((code) => code !== exitCode)) masked.push(`${step.name}: exit ${exitCode} -> ${codes.join(", ")}`);
    }
  }
  assert.deepEqual(masked, [], "a tee step returned a status other than its command's");
});

test("a workflow default or a step-level shell: bash enables pipefail", () => {
  const workflow = (defaults, stepShell, jobDefaults = "", pipe = "make 2>&1 | tee out.log") =>
    `on: push\n${defaults}jobs:\n  build:\n    runs-on: ubuntu-latest\n${jobDefaults}    steps:\n      - uses: actions/checkout@v7\n\n` +
    `      - name: Piped\n${stepShell}        run: |\n          ${pipe}\n`;
  const cases = [
    ["workflow default", workflow("defaults:\n  run:\n    shell: bash\n\n", ""), PIPEFAIL],
    ["job default", workflow("", "", "    defaults:\n      run:\n        shell: bash\n"), PIPEFAIL],
    ["step-level shell", workflow("", "        shell: bash\n"), PIPEFAIL],
    ["neither", workflow("", ""), PLAIN],
  ];
  for (const [label, text, expected] of cases) {
    const step = workflowSteps(text).find((s) => s.name === "Piped");
    assert.deepEqual(step.run, ["make 2>&1 | tee out.log"], `${label}: run lines`);
    assert.deepEqual(bashArgs(text, step), expected, `${label}: shell flags`);
  }
  // A job's own default wins over the workflow's, and an unmodelled shell there is not taken for Bash.
  const jobSh = workflow("defaults:\n  run:\n    shell: bash\n", "", "    defaults:\n      run:\n        shell: sh\n");
  assert.throws(() => bashArgs(jobSh, workflowSteps(jobSh).find((s) => s.name === "Piped")), /does not model/);
  const unspaced = workflow("", "", "", "make|tee out.log");
  assert.ok(TEE.test(workflowSteps(unspaced).find((s) => s.name === "Piped").run[0]), "a pipe into tee without spaces is found");
});

test("build-and-test ratchets backend and frontend coverage", () => {
  const steps = workflowSteps(ciWorkflow());
  const names = steps.map((s) => s.name);
  const frontendTests = steps.find((s) => s.name === "Frontend unit tests");
  assert.match(frontendTests?.run.join("\n") ?? "", /^pnpm exec ng test --watch=false --coverage /m, "frontend tests collect coverage");
  const at = names.indexOf("Coverage ratchet");
  assert.ok(at > names.indexOf("Frontend test-run guard"), `a "Coverage ratchet" step follows the frontend guard (steps: ${names.join(", ")})`);
  const [convert, ...ratchets] = steps[at].run;
  assert.equal(convert, "node scripts/jacoco-summary.mjs", "the JaCoCo report is converted first");
  const sides = ratchets.map((line) => {
    assert.match(line, /^node scripts\/check-coverage-ratchet\.mjs /);
    const args = Object.fromEntries([...line.matchAll(/--(\w+)(?:=(\S+))?/g)].map(([, k, v]) => [k, v ?? true]));
    assert.equal(args.require, true, `${line} requires coverage`);
    assert.ok(args.summary && args.baseline, `${line} names its summary and baseline`);
    return args.label;
  });
  assert.deepEqual(sides, ["backend", "frontend"]);
});
