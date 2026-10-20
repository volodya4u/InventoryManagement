import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function bashExecutable() {
  if (process.platform !== "win32") return "bash";
  const gitCommands = execFileSync("where.exe", ["git"], { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const git of gitCommands) {
    const bash = join(dirname(dirname(git)), "bin", "bash.exe");
    if (existsSync(bash)) return bash;
  }
  throw new Error("Git for Windows Bash is required to exercise the CI pipeline");
}

function evidenceStep() {
  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const job = workflow.split(/^  pr-evidence:\s*$/m)[1]?.split(/^  [\w-]+:\s*$/m)[0];
  assert.ok(job, "pr-evidence job exists");
  const step = job.split(/^      - name: Evidence from the agent log and the specs\s*$/m)[1]?.split(/^      - name:/m)[0];
  assert.ok(step, "the evidence step exists");
  const lines = step.split(/\r?\n/);
  const run = lines.findIndex((line) => line === "        run: |");
  assert.ok(run >= 0, "the evidence step has a run script");
  const commands = [];
  for (const line of lines.slice(run + 1)) {
    if (!line.startsWith("          ")) break;
    commands.push(line.slice(10));
  }
  return { explicitBash: lines.some((line) => /^        shell: bash\s*$/.test(line)), commands };
}

test("pr-evidence CI step propagates a failed gate through tee", () => {
  const { explicitBash, commands } = evidenceStep();
  const pipeline = commands.find((line) => line.includes("scripts/pr-evidence.mjs"));
  assert.match(pipeline ?? "", /^node scripts\/pr-evidence\.mjs .* \| tee -a "\$GITHUB_STEP_SUMMARY"$/);

  for (const exitCode of [17, 0]) {
    const probe = `true\n${pipeline.replace(/^node scripts\/pr-evidence\.mjs .*?(?= \| tee)/, `(exit ${exitCode})`)}`;
    const args = explicitBash
      ? ["--noprofile", "--norc", "-eo", "pipefail", "-c", probe]
      : ["-e", "-c", probe];
    const result = spawnSync(bashExecutable(), args, {
      encoding: "utf8",
      env: { ...process.env, GITHUB_STEP_SUMMARY: "/dev/null" },
    });
    assert.equal(result.status, exitCode, `Bash returned ${result.status}: ${result.stderr}`);
  }
});
