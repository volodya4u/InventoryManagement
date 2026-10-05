// Fingerprints of the project, so a tool can tell whether a check still covers the current files:
//   - the CODE fingerprint: what dod.mjs verifies. The dod-fresh Stop hook (.claude/hooks/dod-fresh.mjs) compares it
//     with target/dod/last-green.json, which dod.mjs writes on a green run, and pr-evidence.mjs compares a DodRun
//     record in the agent log with the head of a pull request;
//   - the TREE fingerprint: what the reviewer reads, every file but the agent log. pr-evidence.mjs compares the
//     reviewer's verdict record with the head of a pull request.
// Each is a hash of (path, git blob id) pairs, not of raw bytes: `git hash-object` converts line endings the way
// `git add` does, so a CRLF checkout on Windows and the LF checkout in CI give the same fingerprint for the same content,
// and the working tree gives the same fingerprint as the commit that stores it.
// "Code" = files that affect dod's build/test/lint result; docs, Markdown and the agent log are excluded (a rules change
// is covered by the evals gate). Working-tree edits and untracked files that are not ignored count: an untracked test
// class still runs in `mvn verify`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { join } from "node:path";

// Exclude the agent log and docs directories, and any Markdown file, from the code fingerprint. dod.mjs's own output
// (target/dod/, the green marker included) never counts, even where target/ is not ignored.
const NOT_CODE = /(^|\/)(\.agent-log|docs)\/|\.md$|^target\/dod\//;
// Every commit appends to the agent log, so the review fingerprint leaves only it (and dod's output) out.
const NOT_REVIEWED = /^\.agent-log\/|^target\/dod\//;

const git = (root, args, input) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });

const isFile = (path) => {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false; // tracked but deleted from the working tree: absent, as in the commit that deletes it
  }
};

function digest(pairs) {
  const hash = createHash("sha256");
  for (const [path, blob] of pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) hash.update(`${path}\0${blob}\n`);
  return hash.digest("hex");
}

// The working tree as `git add -A` would store it: tracked and untracked files that are not ignored.
function workingTree(root, excluded) {
  const listed = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const paths = [...new Set(listed.split("\0").filter(Boolean))].filter((p) => !excluded.test(p) && isFile(join(root, p)));
  if (!paths.length) return [];
  const blobs = git(root, ["hash-object", "--stdin-paths"], paths.join("\n") + "\n").trim().split("\n");
  return paths.map((path, i) => [path, blobs[i]]);
}

// A commit's regular files (mode 100644 / 100755), straight from its tree.
function committedTree(root, rev, excluded) {
  return git(root, ["ls-tree", "-r", "-z", rev])
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t");
      const [mode, , blob] = entry.slice(0, tab).split(" ");
      return { mode, blob, path: entry.slice(tab + 1) };
    })
    .filter(({ mode, path }) => mode.startsWith("100") && !excluded.test(path))
    .map(({ path, blob }) => [path, blob]);
}

export const codeFingerprint = (root) => digest(workingTree(root, NOT_CODE));
export const codeFingerprintAt = (root, rev) => digest(committedTree(root, rev, NOT_CODE));
export const treeFingerprint = (root) => digest(workingTree(root, NOT_REVIEWED));
export const treeFingerprintAt = (root, rev) => digest(committedTree(root, rev, NOT_REVIEWED));

export const markerPath = (root) => join(root, "target", "dod", "last-green.json");
