#!/usr/bin/env node
// Claude Code Stop hook. Reminds (does not block) when the project's code changed since the last green
// `node scripts/dod.mjs`, so a session does not end on unverified changes. dod.mjs writes the code fingerprint to
// target/dod/last-green.json on a green run; this recomputes it and, if it differs, prints a reminder and exits 0.
// No marker yet (a fresh clone, or dod never run) -> stays quiet. Honors stop_hook_active to avoid loops.
// Like the other hooks: never blocks the agent, any error -> exit 0 silently.
import { existsSync, readFileSync } from "node:fs";
import { logRoot } from "./agent-log-lib.mjs";
import { codeFingerprint, markerPath } from "../../scripts/dod-fingerprint.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

try {
  const ev = JSON.parse(raw || "{}");
  if (!ev.stop_hook_active) {
    const root = logRoot(ev.cwd, process.env.CLAUDE_PROJECT_DIR);
    const marker = markerPath(root);
    if (existsSync(marker)) {
      const saved = JSON.parse(readFileSync(marker, "utf8")).fingerprint;
      if (saved && saved !== codeFingerprint(root)) {
        process.stderr.write(
          "Code changed since the last green `node scripts/dod.mjs` (target/dod/last-green.json). " +
            "Re-run it before finishing so the change is verified.\n",
        );
      }
    }
  }
} catch {
  /* a reminder must never fail the session */
}
process.exit(0);
