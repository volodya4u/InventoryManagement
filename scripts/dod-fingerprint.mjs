// A fingerprint of the project's CODE, so the dod-freshness Stop hook (.claude/hooks/dod-fresh.mjs) can tell whether
// anything dod.mjs verifies changed since the last green run. scripts/dod.mjs writes the fingerprint to
// target/dod/last-green.json on a green run; the hook recomputes it at session end and reminds if it differs.
// "Code" = tracked files that affect dod's build/test/lint result; docs, Markdown and the agent log are excluded
// (a rules change is covered by the evals gate, not by this hook). Working-tree edits count; untracked files do not.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Exclude the agent log and docs directories, and any Markdown file, from the code fingerprint.
const NOT_CODE = /(^|\/)(\.agent-log|docs)\/|\.md$/;

export function codeFiles(root) {
  const listed = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return listed.split("\0").filter(Boolean).filter((path) => !NOT_CODE.test(path)).sort();
}

export function codeFingerprint(root) {
  const hash = createHash("sha256");
  for (const rel of codeFiles(root)) {
    hash.update(rel);
    hash.update("\0");
    try {
      hash.update(readFileSync(join(root, rel)));
    } catch {
      // Tracked but missing from the working tree (deleted, not yet staged): its absence still shifts the hash
      // through the path above.
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

export const markerPath = (root) => join(root, "target", "dod", "last-green.json");
