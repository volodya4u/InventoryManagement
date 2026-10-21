#!/usr/bin/env node
// Replay a recorded controlled break (scripts/break-run.mjs) without relying on the pull request's narrative: apply the
// committed docs/evidence/break-runs/<run-id>/mutation.patch, run the test, check that each test the break recorded as
// an assertion failure fails on an assertion again, reverse the patch, check the working tree is exactly as it was, and
// run the test once more (green). Nothing is recorded: a replay is the reviewer's check, not evidence of the branch.
// Usage (from the repo root, on a clean working tree): node scripts/break-replay.mjs <run-id>   (exit 0 = replayed as
// recorded, 1 = it did not, 2 = usage)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EVIDENCE_DIR, applyPatch, readRun, sha256 } from "./break-run.mjs";
import { executeRun } from "./test-run.mjs";

const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trimEnd();
const dirty = (root) => git(root, ["status", "--porcelain", "--", ".", ":(exclude).agent-log"]);

export function replayRun(root, id) {
  const lines = [];
  const problems = [];
  if (dirty(root)) return { problems: ["the working tree has changes: commit or stash them first, so the reverse can be checked"], lines };
  const run = readRun(root, id);
  if (!run?.patchSha256) return { problems: [`no recorded break run ${id} under ${EVIDENCE_DIR}`], lines };
  const patch = join(root, EVIDENCE_DIR, id, "mutation.patch");
  if (sha256(readFileSync(patch)) !== run.patchSha256) return { problems: ["mutation.patch is not the patch the run recorded"], lines };
  const expected = (run.steps.find((s) => s.step === "break")?.results ?? []).filter((t) => t.status === "assertion").map((t) => t.id);
  if (!expected.length) return { problems: ["the recorded break has no test that failed on an assertion"], lines };

  const applied = applyPatch(root, patch);
  if (applied) return { problems: [`the recorded patch no longer applies here (${applied}): replay it on the commit the run was recorded on`], lines };
  try {
    const { record } = executeRun(root, run.target, run.selector);
    const status = new Map((record.results ?? []).map((t) => [t.id, t.status]));
    for (const id of expected) {
      const seen = status.get(id) ?? "not run";
      lines.push(`broken:   ${id}: ${seen}`);
      if (seen !== "assertion") problems.push(`${id} was recorded failing on an assertion, but the replay saw ${seen}`);
    }
  } finally {
    const reversed = applyPatch(root, patch, { reverse: true });
    if (reversed) problems.push(`git apply -R could not reverse the patch (${reversed}): check the working tree by hand`);
  }
  if (dirty(root)) problems.push(`after reversing the patch the working tree is not as it was:\n${dirty(root)}`);
  const { record: after } = executeRun(root, run.target, run.selector);
  lines.push(`restored: ${after.kind}`);
  if (after.kind !== "pass") problems.push(`the restored code is not green (${after.kind})`);
  return { problems, lines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [id, ...extra] = process.argv.slice(2);
  if (!id || extra.length) {
    console.error("Usage: node scripts/break-replay.mjs <run-id>");
    process.exit(2);
  }
  const { problems, lines } = replayRun(process.cwd(), id);
  for (const line of lines) console.log(line);
  for (const p of problems) console.error(`break-replay: ${p}`);
  console.log(problems.length ? `Run ${id} did not replay as recorded.` : `Run ${id} replayed as recorded: the break fails its test, the restore is clean and green.`);
  process.exit(problems.length ? 1 : 0);
}
